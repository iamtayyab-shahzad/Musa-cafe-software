package utils

type AppError struct {
	Status  int
	Message string
}

func (e *AppError) Error() string {
	return e.Message
}

func NewAppError(status int, message string) error {
	return &AppError{Status: status, Message: message}
}
