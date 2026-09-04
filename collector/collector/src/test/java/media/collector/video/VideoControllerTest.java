package media.collector.video;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class VideoControllerTest {

    @Mock
    private VideoRepository videos;

    @Test
    void returnsVideosInSavedOrder() {
        List<Video> expected = List.of(video(false));
        when(videos.findAllByOrderBySavedAtDesc()).thenReturn(expected);

        assertEquals(expected, new VideoController(videos).getVideos());
        verify(videos).findAllByOrderBySavedAtDesc();
    }

    @Test
    void getsVideoById() {
        Video expected = video(false);
        when(videos.findById("id")).thenReturn(Optional.of(expected));

        assertEquals(expected, new VideoController(videos).getVideo("id"));
    }

    @Test
    void missingVideoProducesNotFound() {
        when(videos.findById("missing")).thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> new VideoController(videos).getVideo("missing"));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    @Test
    void savesVideoWithGeneratedIdAndDefaults() {
        when(videos.save(any(Video.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ResponseEntity<Video> response = new VideoController(videos).saveVideo(
                new VideoController.CreateVideoRequest("Title", "url", "thumb", "site", List.of("Collection")));

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        Video saved = response.getBody();
        assertNotNull(saved);
        assertNotNull(saved.getId());
        assertEquals("Title", saved.getTitle());
        assertEquals("url", saved.getUrl());
        assertEquals("thumb", saved.getThumbnail());
        assertEquals("site", saved.getPlatform());
        assertEquals(List.of("Collection"), saved.getCollections());
        assertEquals(false, saved.isFavorite());
    }

    @Test
    void updatesOnlyProvidedFields() {
        Video existing = video(false);
        when(videos.findById("id")).thenReturn(Optional.of(existing));
        when(videos.save(existing)).thenReturn(existing);

        Video result = new VideoController(videos).updateVideo("id",
                new VideoController.UpdateVideoRequest("New title", null, null, null, true, List.of("New")));

        assertEquals(existing, result);
        assertEquals("New title", existing.getTitle());
        assertEquals("url", existing.getUrl());
        assertEquals("thumb", existing.getThumbnail());
        assertEquals("site", existing.getPlatform());
        assertEquals(true, existing.isFavorite());
        assertEquals(List.of("New"), existing.getCollections());
    }

    @Test
    void togglesFavoriteAndDeletesVideo() {
        Video existing = video(false);
        when(videos.findById("id")).thenReturn(Optional.of(existing));
        when(videos.save(existing)).thenReturn(existing);

        Video toggled = new VideoController(videos).toggleFavorite("id");
        ResponseEntity<Void> response = new VideoController(videos).deleteVideo("id");

        assertEquals(true, toggled.isFavorite());
        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(videos).delete(existing);
    }

    @Test
    void deleteDoesNotCallRepositoryForMissingVideo() {
        when(videos.findById("missing")).thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () -> new VideoController(videos).deleteVideo("missing"));

        verify(videos, never()).delete(any(Video.class));
    }

    private Video video(boolean favorite) {
        return new Video("id", "Title", "url", "thumb", "site", Instant.EPOCH, favorite, List.of("Collection"));
    }
}