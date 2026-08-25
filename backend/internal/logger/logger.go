package logger

import (
	"encoding/json"
	"io"
	"os"
	"sync"
	"time"
)

type Level string

const (
	LevelInfo  Level = "INFO"
	LevelWarn  Level = "WARN"
	LevelError Level = "ERROR"
	LevelDebug Level = "DEBUG"
)

type Logger struct {
	mu  sync.Mutex
	out io.Writer
}

var defaultLogger = &Logger{out: os.Stdout}

func Default() *Logger {
	return defaultLogger
}

func (l *Logger) log(level Level, msg string, fields map[string]any) {
	payload := map[string]any{
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"level":     level,
		"message":   msg,
	}
	for k, v := range fields {
		payload[k] = v
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	_, _ = l.out.Write(append(b, '\n'))
}

func (l *Logger) Info(msg string, fields map[string]any)  { l.log(LevelInfo, msg, fields) }
func (l *Logger) Warn(msg string, fields map[string]any)  { l.log(LevelWarn, msg, fields) }
func (l *Logger) Error(msg string, fields map[string]any) { l.log(LevelError, msg, fields) }
func (l *Logger) Debug(msg string, fields map[string]any) { l.log(LevelDebug, msg, fields) }

func Info(msg string, fields map[string]any)  { defaultLogger.Info(msg, fields) }
func Warn(msg string, fields map[string]any)  { defaultLogger.Warn(msg, fields) }
func Error(msg string, fields map[string]any) { defaultLogger.Error(msg, fields) }
func Debug(msg string, fields map[string]any) { defaultLogger.Debug(msg, fields) }
