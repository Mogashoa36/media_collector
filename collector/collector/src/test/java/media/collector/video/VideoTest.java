package media.collector.video;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class VideoTest {

    @Test
    void copiesCollectionsAndExposesVideoFields() {
        Instant savedAt = Instant.parse("2026-01-01T00:00:00Z");
        List<String> collections = List.of("Watch later");
        Video video = new Video("id", "Title", "https://example.test/video", "thumb", "site", savedAt, false, collections);

        assertEquals("id", video.getId());
        assertEquals("Title", video.getTitle());
        assertEquals("https://example.test/video", video.getUrl());
        assertEquals("thumb", video.getThumbnail());
        assertEquals("site", video.getPlatform());
        assertEquals(savedAt, video.getSavedAt());
        assertFalse(video.isFavorite());
        assertEquals(collections, video.getCollections());
        assertNotSame(collections, video.getCollections());
    }

    @Test
    void nullCollectionsBecomeEmptyAndSettersUpdateFields() {
        Video video = new Video("id", "Title", "url", null, "site", Instant.EPOCH, false, null);

        assertTrue(video.getCollections().isEmpty());

        video.setTitle("New title");
        video.setUrl("new-url");
        video.setThumbnail("new-thumb");
        video.setPlatform("new-site");
        video.setFavorite(true);
        video.setCollections(List.of("New collection"));

        assertEquals("New title", video.getTitle());
        assertEquals("new-url", video.getUrl());
        assertEquals("new-thumb", video.getThumbnail());
        assertEquals("new-site", video.getPlatform());
        assertTrue(video.isFavorite());
        assertEquals(List.of("New collection"), video.getCollections());
    }

    @Test
    void nullCollectionSetterClearsCollections() {
        Video video = new Video("id", "Title", "url", null, "site", Instant.EPOCH, false, List.of("Existing"));

        video.setCollections(null);

        assertTrue(video.getCollections().isEmpty());
    }
}