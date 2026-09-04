package media.collector.video;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VideoRepository extends JpaRepository<Video, String> {
    List<Video> findAllByOrderBySavedAtDesc();
}