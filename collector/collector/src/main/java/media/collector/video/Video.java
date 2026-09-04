package media.collector.video;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "videos")
public class Video {

    @Id
    @Column(length = 64, nullable = false, updatable = false)
    private String id;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(nullable = false, length = 2048)
    private String url;

    @Column(length = 2048)
    private String thumbnail;

    @Column(nullable = false, length = 50)
    private String platform;

    @Column(nullable = false)
    private Instant savedAt;

    @Column(nullable = false)
    private boolean favorite;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "video_collections", joinColumns = @JoinColumn(name = "video_id"))
    @Column(name = "collection_name", length = 100)
    private List<String> collections = new ArrayList<>();

    protected Video() {
    }

    public Video(String id, String title, String url, String thumbnail, String platform, Instant savedAt, boolean favorite, List<String> collections) {
        this.id = id;
        this.title = title;
        this.url = url;
        this.thumbnail = thumbnail;
        this.platform = platform;
        this.savedAt = savedAt;
        this.favorite = favorite;
        this.collections = collections == null ? new ArrayList<>() : new ArrayList<>(collections);
    }

    public String getId() { return id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public String getThumbnail() { return thumbnail; }
    public void setThumbnail(String thumbnail) { this.thumbnail = thumbnail; }
    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }
    public Instant getSavedAt() { return savedAt; }
    public boolean isFavorite() { return favorite; }
    public void setFavorite(boolean favorite) { this.favorite = favorite; }
    public List<String> getCollections() { return collections; }
    public void setCollections(List<String> collections) { this.collections = collections == null ? new ArrayList<>() : new ArrayList<>(collections); }
}