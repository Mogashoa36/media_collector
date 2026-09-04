package media.collector.collection;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/collections")
public class CollectionController {

    private final CollectionRepository collections;

    public CollectionController(CollectionRepository collections) {
        this.collections = collections;
    }

    @GetMapping
    public List<Collection> getCollections() {
        return collections.findAll();
    }

    @PostMapping
    public ResponseEntity<Collection> createCollection(@Valid @RequestBody CollectionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(collections.save(new Collection(request.name())));
    }

    @DeleteMapping("/{name}")
    public ResponseEntity<Void> deleteCollection(@PathVariable String name) {
        if (collections.existsById(name)) collections.deleteById(name);
        return ResponseEntity.noContent().build();
    }

    public record CollectionRequest(@NotBlank String name) { }
}