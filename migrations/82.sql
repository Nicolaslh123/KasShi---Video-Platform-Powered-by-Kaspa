UPDATE tracks SET cover_art_url = NULL WHERE cover_art_url = 'null' OR cover_art_url = 'undefined';
UPDATE albums SET cover_art_url = NULL WHERE cover_art_url = 'null' OR cover_art_url = 'undefined';
UPDATE podcasts SET cover_art_url = NULL WHERE cover_art_url = 'null' OR cover_art_url = 'undefined';
UPDATE podcast_episodes SET cover_art_url = NULL WHERE cover_art_url = 'null' OR cover_art_url = 'undefined';
UPDATE playlists SET cover_art_url = NULL WHERE cover_art_url = 'null' OR cover_art_url = 'undefined';