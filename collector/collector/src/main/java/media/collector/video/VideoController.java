package media.collector.video;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/videos")
public class VideoController {

    private final VideoRepository videos;

    public VideoController(VideoRepository videos) {
        this.videos = videos;
    }

    @GetMapping
    public List<Video> getVideos() {
        return videos.findAllByOrderBySavedAtDesc();
    }

    @GetMapping("/{id}")
    public Video getVideo(@PathVariable String id) {
        return findVideo(id);
    }

    @PostMapping
    public ResponseEntity<Video> saveVideo(@Valid @RequestBody CreateVideoRequest request) {
        Video video = new Video(UUID.randomUUID().toString(), request.title(), request.url(), request.thumbnail(), request.platform(), Instant.now(), false, request.collections());
        return ResponseEntity.status(HttpStatus.CREATED).body(videos.save(video));
    }

    @PatchMapping("/{id}")
    public Video updateVideo(@PathVariable String id, @Valid @RequestBody UpdateVideoRequest request) {
        Video video = findVideo(id);
        if (request.title() != null) video.setTitle(request.title());
        if (request.url() != null) video.setUrl(request.url());
        if (request.thumbnail() != null) video.setThumbnail(request.thumbnail());
        if (request.platform() != null) video.setPlatform(request.platform());
        if (request.favorite() != null) video.setFavorite(request.favorite());
        if (request.collections() != null) video.setCollections(request.collections());
        return videos.save(video);
    }

    @PatchMapping("/{id}/favorite")
    public Video toggleFavorite(@PathVariable String id) {
        Video video = findVideo(id);
        video.setFavorite(!video.isFavorite());
        return videos.save(video);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteVideo(@PathVariable String id) {
        videos.delete(findVideo(id));
        return ResponseEntity.noContent().build();
    }

    private Video findVideo(String id) {
        return videos.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Video not found"));
    }

    public record CreateVideoRequest(
            @NotBlank String title,
            @NotBlank String url,
            String thumbnail,
            @NotBlank String platform,
            List<String> collections) { }

    public record UpdateVideoRequest(
            String title,
            String url,
            String thumbnail,
            String platform,
            Boolean favorite,
            List<String> collections) { }
}