package cloudinary

import "testing"

func TestSignature_CloudinaryDocsExample(t *testing.T) {
	// https://cloudinary.com/documentation/authentication_signatures
	got := Signature(map[string]string{
		"timestamp": "1315060510",
		"public_id": "sample",
	}, "abcd")
	want := "c3470533147774275dd37996cc4d0e68fd03cd4f"
	if got != want {
		t.Fatalf("signature=%s want %s", got, want)
	}
}

func TestSignature_OmitsEmptyValues(t *testing.T) {
	withEmpty := Signature(map[string]string{
		"folder":    "musacafe",
		"timestamp": "1700000000",
		"public_id": "",
	}, "secret")
	without := Signature(map[string]string{
		"folder":    "musacafe",
		"timestamp": "1700000000",
	}, "secret")
	if withEmpty != without {
		t.Fatalf("empty params must not change the signature")
	}
}
