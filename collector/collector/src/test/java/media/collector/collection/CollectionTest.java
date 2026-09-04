package media.collector.collection;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class CollectionTest {

    @Test
    void storesCollectionName() {
        Collection collection = new Collection("Favorites");

        assertEquals("Favorites", collection.getName());
    }
}