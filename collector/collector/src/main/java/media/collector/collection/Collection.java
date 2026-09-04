package media.collector.collection;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "collections")
public class Collection {

    @Id
    @Column(length = 100)
    private String name;

    protected Collection() {
    }

    public Collection(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }
}