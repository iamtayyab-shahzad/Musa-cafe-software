// Command uploadimages bulk-uploads product photos to Cloudinary and updates
// shared/menu.json with the returned URLs (products without a mapped image are
// left unchanged).
//
// Usage (from backend/):
//
//	go run ./cmd/uploadimages -zip "C:\path\to\images.zip"
//	go run ./cmd/uploadimages -dir "C:\path\to\extracted\images"
//	go run ./cmd/uploadimages -zip ... -dry-run
package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"backend/internal/cloudinary"
	"backend/internal/config"

	"github.com/disintegration/imaging"
	"github.com/joho/godotenv"
	_ "golang.org/x/image/webp"
)

type menuDoc struct {
	Restaurant any `json:"restaurant"`
	Promotions any `json:"promotions"`
	Locations  any `json:"locations"`
	Categories []struct {
		DisplayOrder int    `json:"displayOrder"`
		ID           string `json:"id"`
		Image        string `json:"image"`
		Name         string `json:"name"`
		Slug         string `json:"slug"`
	} `json:"categories"`
	Products   []struct {
		ID               string `json:"id"`
		Category         string `json:"category"`
		Name             string `json:"name"`
		Description      string `json:"description"`
		Image            string `json:"image"`
		Featured         bool   `json:"featured"`
		AllowManualPrice bool   `json:"allowManualPrice"`
		Sizes            any    `json:"sizes"`
	} `json:"products"`
}

// Relative paths inside the extracted images/ folder (from images.zip).
var productImagePaths = map[string]string{
	"One Man Show":              "deals/Deal1.png",
	"One Person Deal":           "deals/deal2.png",
	"Midnight Deal":             "deals/deal3.png",
	"Small Deal":                "deals/deal4.png",
	"Family Deal":               "deals/deal5.png",
	"Fajita Pizza":              "pizzas/chicken-fajita.png",
	"Chicken Tikka":             "pizzas/chicken-tika.png",
	"Smokey BBQ":                "pizzas/bbq pizza.png",
	"Special":                   "pizzas/kruchies-special-pizza.png",
	"Crown Crust":               "pizzas/crown cursh pizza.png",
	"Kebab Crust":               "pizzas/kabab-staff.avif",
	"Cheese Lover":              "pizzas/chicken-lover.png",
	"Malai Boti":                "pizzas/legend malai.png",
	"Peproni":                   "pizzas/peproni.jpg",
	"Zinger Burger":             "sandwhich/zinger-burger.png",
	"Peti Burger":               "sandwhich/chicken-patty-burger.jpg",
	"Chapli Burger":             "sandwhich/chuply-burger.jpg",
	"Tikka Burger":              "sandwhich/tikka-burger.webp",
	"Pizza Burger":              "sandwhich/pizza-burger.webp",
	"Mighty Burger":             "sandwhich/mighty-zinger-barger.webp",
	"Regular Fries":             "fries/salted-fries.jpg",
	"Loaded Fries":              "fries/loaded-fries.jpg",
	"Pizza Fries":               "fries/pizza-fries.webp",
	"Crunchy Loaded Fries":      "fries/masala-fries.webp",
	"Special Pizza Fries":       "fries/masala-fries.webp",
	"Alfaredo Pasta":            "Pasta/creamy-pasta.jpg",
	"Special Alfaredo Pasta":    "Pasta/Creamy-Chicken-Pasta.jpg",
	"Oven Baked Pasta":          "Pasta/loaded-pasta.jpg",
	"Special Oven Baked Pasta":  "Pasta/loaded-pasta.jpg",
	"Wings":                     "fried-chicken/bbq wings.jfif",
	"Hot Wings":                 "fried-chicken/hot-wings.jpg",
	"Hot Short":                 "fried-chicken/hotshots.jfif",
	"Nuggets":                   "fried-chicken/chicken-noggets.jpg",
	"Loaded Fries Special":      "fries/loaded-fries.jpg",
	"Arabic Roll":               "rolls/arabic-roll.jpg",
	"Zinger Shawarma":           "rolls/twister-patty-roll.jpg",
	"Tikka Shawarma":            "rolls/chicken-tika.webp",
	"Chicken Pratha Roll":       "rolls/chicken-patty-roll.jpg",
	"Chicken Shawarma":          "rolls/malai-boti-roll.jpg",
	"Full Broast":               "fried-chicken/chicken-drum.jpg",
	"Grill Sandwich":            "sandwhich/bbqsandwhich.jpg",
	"Club Sandwich":             "sandwhich/kruncher-salad.png",
	"Panini Sandwich":           "sandwhich/maxican-sandwhich.jpg",
	"1.5L Drink":                "cold-drinks/1.5litercoca.webp",
	"1L Drink":                  "cold-drinks/1literfanta.jpg",
	"2.5L Drink":                "cold-drinks/2.25litercoca.jpg",
	"Half Litre Drink":          "cold-drinks/softdrink.jpg",
	"350ml Drink":               "cold-drinks/tin.jpg",
	"250ml Water":               "cold-drinks/mineralwater.avif",
	"1.5L Water":                "cold-drinks/mineralwater.avif",
	"Half Litre Water":          "cold-drinks/mineralwater.avif",
	"Sting":                     "cold-drinks/images (1).jfif",
	"350ml Sting":               "cold-drinks/tin.jpg",
	"Mint Margarita":            "shakes/mint-margeta.jpg",
	"Sulet Burger":              "generated/sulet-burger.png",
	"Beef Burger":               "generated/beef-burger.png",
	"RH Special Burger":         "generated/rh-special-burger.png",
	"Oven Baked":                "generated/oven-baked-wings.png",
	"Zinger Pratha Roll":        "generated/zinger-pratha-roll.png",
	"All Baked Chicken Broast":  "generated/baked-chicken-broast.png",
	"Chicken Manchurian with Rice": "generated/chicken-manchurian-rice.png",
	"Chicken Chilli Dry with Rice": "generated/chicken-chilli-dry-rice.png",
	"Special Chicken Chowmein":  "generated/chicken-chowmein.png",
	"Crispy Loaded Nachos":      "generated/loaded-nachos.png",
	"Samosa":                    "generated/samosa.png",
	"Pakorey":                   "generated/pakorey.png",
	"Chips":                     "generated/chips.png",
	"Shorma":                    "generated/shorma.png",
	"Shorma Special":            "generated/shorma-special.png",
	"Shami Burger":              "generated/shami-burger.png",
	"Chicken Burger":            "generated/chicken-burger.png",
	"Mix Mithai":                "generated/mix-mithai.png",
	"Special Mithai":            "generated/special-mithai.png",
	"Sada Bari":                 "generated/sada-bari.png",
	"Kalakand Bari":             "generated/kalakand-bari.png",
	"Lado":                      "generated/lado.png",
	"Jalebi":                    "generated/jalebi.png",
	"Namak Para":                "generated/namak-para.png",
	"Sada Biscuits":             "generated/sada-biscuits.png",
	"Special Biscuit":           "generated/special-biscuit.png",
	"Kak Rus":                   "generated/kak-rus.png",
	"Small Bread":               "generated/small-bread.png",
	"Large Bread":               "generated/large-bread.png",
	"Double Roti":               "generated/double-roti.png",
	"Large Double Roti":         "generated/large-double-roti.png",
	"Ras Packet":                "generated/ras-packet.png",
	"Kholi Rus":                 "generated/kholi-rus.png",
	"Nestle 1L":                 "generated/juice-1l.png",
	"Popular Juice":             "generated/popular-juice.png",
	"1L Popular Juice":          "generated/juice-1l-bottle.png",
	"Half Litre Popular Juice":  "generated/juice-half-litre.png",
	"Nestle 2.5L":               "generated/juice-2-5l.png",
	"Nestle 250ml":              "generated/juice-250ml.png",
	"Nastfrie":                  "generated/nastfrie.png",
	"Shazan Juice":              "generated/shazan-juice.png",
}

var categoryImagePaths = map[string]string{
	"Deals":                 "categories/cat-deals.png",
	"Standard Pizza":        "categories/cat-standard-pizza.png",
	"Premium Pizza":         "categories/cat-premium-pizza.png",
	"Burgers":               "categories/cat-burgers.png",
	"Fries":                 "categories/cat-fries.png",
	"Pasta":                 "categories/cat-pasta.png",
	"Wings & Snacks":        "categories/cat-wings-snacks.png",
	"Rolls & Shawarma":      "categories/cat-rolls-shawarma.png",
	"Broast":                "categories/cat-broast.png",
	"Sandwiches":            "categories/cat-sandwiches.png",
	"Chinese":               "categories/cat-chinese.png",
	"Chowmein":              "categories/cat-chowmein.png",
	"Nachos":                "categories/cat-nachos.png",
	"Snacks & Savouries":    "categories/cat-snacks-savouries.png",
	"Sweets":                "categories/cat-sweets.png",
	"Biscuits & Bakery":     "categories/cat-biscuits-bakery.png",
	"Cold Drinks":           "categories/cat-cold-drinks.png",
}

func main() {
	zipPath := flag.String("zip", "", "path to images.zip (extracted to a temp folder)")
	dirPath := flag.String("dir", "", "path to extracted images/ root (contains pizzas/, fries/, etc.)")
	menuPath := flag.String("menu", "../shared/menu.json", "path to menu.json")
	dryRun := flag.Bool("dry-run", false, "print mappings without uploading")
	onlyMissing := flag.Bool("only-missing", true, "skip products that already have a Cloudinary URL")
	flag.Parse()

	_ = godotenv.Load(".env.local", ".env", "../../.env.local", "../../.env")
	cfg := config.CloudinaryConfig{
		CloudName: os.Getenv("CLOUDINARY_CLOUD_NAME"),
		APIKey:    os.Getenv("CLOUDINARY_API_KEY"),
		APISecret: os.Getenv("CLOUDINARY_API_SECRET"),
	}
	if !cfg.Configured() {
		log.Fatal("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in backend/.env.local")
	}

	root, cleanup, err := resolveImageRoot(*zipPath, *dirPath)
	if err != nil {
		log.Fatalf("images: %v", err)
	}
	if cleanup != nil {
		defer cleanup()
	}
	fmt.Printf("Using image root: %s\n", root)

	menuBytes, err := os.ReadFile(*menuPath)
	if err != nil {
		log.Fatalf("read menu: %v", err)
	}
	var menu menuDoc
	if err := json.Unmarshal(menuBytes, &menu); err != nil {
		log.Fatalf("parse menu: %v", err)
	}

	uploaded := 0
	missing := 0

	for i := range menu.Products {
		name := menu.Products[i].Name
		rel, ok := productImagePaths[name]
		if !ok {
			continue
		}
		if *onlyMissing && strings.Contains(menu.Products[i].Image, "res.cloudinary.com") {
			continue
		}
		filePath, err := findImageFile(root, rel)
		if err != nil {
			fmt.Printf("  MISSING  %-28s → %s (%v)\n", name, rel, err)
			missing++
			continue
		}
		if *dryRun {
			fmt.Printf("  DRY-RUN  %-28s → %s\n", name, filePath)
			continue
		}

		payload, uploadName, err := prepareUploadPayload(filePath)
		if err != nil {
			log.Fatalf("prepare %q (%s): %v", name, filePath, err)
		}
		url, err := cloudinary.UploadImage(context.Background(), cfg, "musacafe/products", bytes.NewReader(payload), uploadName)
		if err != nil {
			log.Fatalf("upload %q (%s): %v", name, filePath, err)
		}
		menu.Products[i].Image = url
		uploaded++
		fmt.Printf("  OK       %-28s → %s\n", name, url)
	}

	for i := range menu.Categories {
		name := menu.Categories[i].Name
		rel, ok := categoryImagePaths[name]
		if !ok {
			continue
		}
		if *onlyMissing && strings.Contains(menu.Categories[i].Image, "res.cloudinary.com") {
			continue
		}
		filePath, err := findImageFile(root, rel)
		if err != nil {
			fmt.Printf("  MISSING  cat %-24s → %s (%v)\n", name, rel, err)
			missing++
			continue
		}
		if *dryRun {
			fmt.Printf("  DRY-RUN  cat %-24s → %s\n", name, filePath)
			continue
		}
		payload, uploadName, err := prepareUploadPayload(filePath)
		if err != nil {
			log.Fatalf("prepare category %q (%s): %v", name, filePath, err)
		}
		url, err := cloudinary.UploadImage(context.Background(), cfg, "musacafe/categories", bytes.NewReader(payload), uploadName)
		if err != nil {
			log.Fatalf("upload category %q (%s): %v", name, filePath, err)
		}
		menu.Categories[i].Image = url
		uploaded++
		fmt.Printf("  OK       cat %-24s → %s\n", name, url)
	}

	if *dryRun {
		fmt.Printf("\nDry run complete. %d product(s) and %d categor(ies) mapped.\n",
			len(productImagePaths), len(categoryImagePaths))
		return
	}

	out, err := json.MarshalIndent(menu, "", "  ")
	if err != nil {
		log.Fatalf("encode menu: %v", err)
	}
	out = append(out, '\n')
	if err := os.WriteFile(*menuPath, out, 0o644); err != nil {
		log.Fatalf("write menu: %v", err)
	}
	fmt.Printf("\nUpdated %s (%d uploaded, %d missing image file)\n",
		*menuPath, uploaded, missing)

	for _, dest := range []string{
		"../pos/src/data/menu.json",
		"../website/src/data/menu.json",
	} {
		if err := os.WriteFile(dest, out, 0o644); err != nil {
			log.Printf("warn: could not sync %s: %v", dest, err)
		} else {
			fmt.Printf("Synced %s\n", dest)
		}
	}

	if uploaded == 0 {
		log.Fatal("no images uploaded")
	}
}

func resolveImageRoot(zipPath, dirPath string) (string, func(), error) {
	if strings.TrimSpace(dirPath) != "" {
		root, err := normalizeRoot(dirPath)
		return root, nil, err
	}
	if strings.TrimSpace(zipPath) == "" {
		return "", nil, fmt.Errorf("pass -zip or -dir")
	}
	tmp, err := os.MkdirTemp("", "uploadimages-*")
	if err != nil {
		return "", nil, err
	}
	cleanup := func() { _ = os.RemoveAll(tmp) }
	if err := extractZip(zipPath, tmp); err != nil {
		cleanup()
		return "", nil, err
	}
	root, err := normalizeRoot(tmp)
	if err != nil {
		cleanup()
		return "", nil, err
	}
	return root, cleanup, nil
}

func normalizeRoot(path string) (string, error) {
	path = filepath.Clean(path)
	if entries, err := os.ReadDir(path); err == nil {
		for _, e := range entries {
			if e.IsDir() && strings.EqualFold(e.Name(), "images") {
				return filepath.Join(path, e.Name()), nil
			}
		}
	}
	// Already the images/ folder if it contains pizzas/ or cold-drinks/
	for _, sub := range []string{"pizzas", "Pasta", "cold-drinks", "fries", "generated", "categories"} {
		if st, err := os.Stat(filepath.Join(path, sub)); err == nil && st.IsDir() {
			return path, nil
		}
	}
	return "", fmt.Errorf("could not find images/ root under %s", path)
}

func extractZip(zipPath, dest string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()
	for _, f := range r.File {
		target := filepath.Join(dest, f.Name)
		if !strings.HasPrefix(filepath.Clean(target), filepath.Clean(dest)+string(os.PathSeparator)) {
			return fmt.Errorf("illegal zip path: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.Create(target)
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(out, rc)
		out.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func findImageFile(root, rel string) (string, error) {
	rel = filepath.FromSlash(rel)
	candidates := []string{
		filepath.Join(root, rel),
	}
	// Case-insensitive fallback on Windows.
	baseDir := filepath.Dir(rel)
	baseName := strings.ToLower(filepath.Base(rel))
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if strings.EqualFold(filepath.Base(path), filepath.Base(rel)) {
			candidates = append(candidates, path)
		}
		if baseDir != "." {
			if strings.Contains(strings.ToLower(path), strings.ToLower(baseDir)) &&
				strings.EqualFold(filepath.Base(path), filepath.Base(rel)) {
				candidates = append(candidates, path)
			}
		}
		if strings.EqualFold(filepath.Base(path), baseName) {
			candidates = append(candidates, path)
		}
		return nil
	})
	seen := map[string]bool{}
	for _, c := range candidates {
		c = filepath.Clean(c)
		if seen[c] {
			continue
		}
		seen[c] = true
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c, nil
		}
	}
	return "", fmt.Errorf("file not found under %s", rel)
}

const maxEdgePx = 1200
const targetBytes = 400 * 1024

func prepareUploadPayload(path string) ([]byte, string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, "", err
	}
	if len(raw) <= cloudinary.MaxUploadBytes() && len(raw) <= targetBytes {
		return raw, filepath.Base(path), nil
	}

	img, err := imaging.Decode(bytes.NewReader(raw))
	if err != nil {
		if len(raw) <= cloudinary.MaxUploadBytes() {
			return raw, filepath.Base(path), nil
		}
		return nil, "", fmt.Errorf("decode image: %w", err)
	}
	img = imaging.Fit(img, maxEdgePx, maxEdgePx, imaging.Lanczos)
	base := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)) + ".jpg"
	var best []byte
	for _, q := range []int{85, 75, 65, 55, 45} {
		var buf bytes.Buffer
		if err := imaging.Encode(&buf, img, imaging.JPEG, imaging.JPEGQuality(q)); err != nil {
			return nil, "", err
		}
		if best == nil || buf.Len() < len(best) {
			best = append(best[:0], buf.Bytes()...)
		}
		if buf.Len() <= targetBytes {
			best = append(best[:0], buf.Bytes()...)
			break
		}
	}
	if len(best) == 0 {
		return nil, "", fmt.Errorf("compress failed")
	}
	if len(best) > cloudinary.MaxUploadBytes() {
		return nil, "", fmt.Errorf("compressed image still too large (%d bytes)", len(best))
	}
	return best, base, nil
}
