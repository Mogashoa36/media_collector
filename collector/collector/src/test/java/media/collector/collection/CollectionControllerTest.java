package media.collector.collection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

@ExtendWith(MockitoExtension.class)
class CollectionControllerTest {

    @Mock
    private CollectionRepository collections;

    @Test
    void returnsAllCollections() {
        List<Collection> expected = List.of(new Collection("Favorites"));
        when(collections.findAll()).thenReturn(expected);

        assertEquals(expected, new CollectionController(collections).getCollections());
    }

    @Test
    void createsCollection() {
        Collection saved = new Collection("Favorites");
        when(collections.save(any(Collection.class))).thenReturn(saved);

        ResponseEntity<Collection> response = new CollectionController(collections)
                .createCollection(new CollectionController.CollectionRequest("Favorites"));

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertEquals(saved, response.getBody());
        verify(collections).save(any(Collection.class));
    }

    @Test
    void deletesExistingCollection() {
        when(collections.existsById("Favorites")).thenReturn(true);

        ResponseEntity<Void> response = new CollectionController(collections).deleteCollection("Favorites");

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(collections).deleteById("Favorites");
    }

    @Test
    void doesNotDeleteMissingCollection() {
        when(collections.existsById("Missing")).thenReturn(false);

        new CollectionController(collections).deleteCollection("Missing");

        verify(collections, never()).deleteById("Missing");
    }
}