package source

import (
	"bytes"
	"io"
)

func OpenUpload(data []byte) io.ReadCloser { return io.NopCloser(bytes.NewReader(data)) }
