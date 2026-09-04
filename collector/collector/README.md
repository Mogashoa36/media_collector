# Media Collector API

Spring Boot REST API backed by PostgreSQL.

## Local setup

Start PostgreSQL:

```bash
docker compose up -d postgres
```

The application defaults to:

- URL: `jdbc:postgresql://localhost:5432/media_collector`
- Username: `postgres`
- Password: `postgres`
- Port: `8080`

Override these values with `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `PORT`, and `CORS_ALLOWED_ORIGINS` environment variables.

Run the API with Java 17 or newer:

```bash
./mvnw spring-boot:run
```

The wrapper may need its executable bit restored in a fresh checkout:

```bash
chmod +x mvnw
```

## Endpoints

- `GET /api/videos`
- `GET /api/videos/{id}`
- `POST /api/videos`
- `PATCH /api/videos/{id}`
- `PATCH /api/videos/{id}/favorite`
- `DELETE /api/videos/{id}`
- `GET /api/collections`
- `POST /api/collections`
- `DELETE /api/collections/{name}`

Example video payload:

```json
{
  "title": "Spring Boot Microservices Tutorial",
  "url": "https://example.com/video",
  "thumbnail": "https://example.com/image.jpg",
  "platform": "YouTube",
  "collections": ["Java", "Tutorials"]
}
```

For tests, the `test` profile uses an in-memory H2 database, so PostgreSQL does not need to be running.
