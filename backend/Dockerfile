FROM golang:1.26.8-bookworm@sha256:9fdc884aacc3bec89b20ffc69f4bb369c78210e3e4f600387b5128b12c199f81 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /catalog ./cmd/app

FROM scratch
COPY --from=build /catalog /catalog
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/catalog"]
CMD ["serve"]
