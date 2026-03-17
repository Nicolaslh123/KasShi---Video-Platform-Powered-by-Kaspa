import { AudioTrack } from '../components/AudioPlayer';

export interface Album {
  id: number;
  title: string;
  artist: string;
  cover: string;
  releaseYear: number;
  genre: string;
  description?: string;
  tracks: AudioTrack[];
}

export interface Playlist {
  id: number;
  title: string;
  description?: string;
  cover: string;
  creatorName: string;
  isPublic: boolean;
  tracks: AudioTrack[];
  createdAt: string;
}

export interface PodcastEpisode {
  id: number;
  title: string;
  description: string;
  durationSeconds: number;
  publishedAt: string;
  audioUrl: string;
  videoUrl?: string; // For video podcasts
  hasVideo: boolean;
  chapters?: { id: number; title: string; startTimeSeconds: number }[];
}

export interface Podcast {
  id: number;
  title: string;
  host: string;
  cover: string;
  description: string;
  category: string;
  hasVideo: boolean;
  followerCount: number;
  episodes: PodcastEpisode[];
}

// Demo albums with full track data
export const albums: Album[] = [
  {
    id: 1,
    title: 'Cosmic Waves',
    artist: 'Nova Dreams',
    cover: 'https://images.unsplash.com/photo-1614149162883-504ce4d13909?w=600&q=80',
    releaseYear: 2024,
    genre: 'Electronic',
    description: 'A journey through the cosmos with ambient electronic soundscapes.',
    tracks: [
      {
        id: 101,
        title: 'Stellar Journey',
        artist: 'Nova Dreams',
        durationSeconds: 272,
        albumTitle: 'Cosmic Waves',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1614149162883-504ce4d13909?w=300&q=80',
        chapters: [
          { id: 1, title: 'Intro', startTimeSeconds: 0 },
          { id: 2, title: 'First Verse', startTimeSeconds: 45 },
          { id: 3, title: 'Chorus', startTimeSeconds: 90 },
          { id: 4, title: 'Bridge', startTimeSeconds: 150 },
          { id: 5, title: 'Outro', startTimeSeconds: 220 },
        ],
      },
      {
        id: 102,
        title: 'Nebula Drift',
        artist: 'Nova Dreams',
        durationSeconds: 245,
        albumTitle: 'Cosmic Waves',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1614149162883-504ce4d13909?w=300&q=80',
      },
      {
        id: 103,
        title: 'Gravity Well',
        artist: 'Nova Dreams',
        durationSeconds: 318,
        albumTitle: 'Cosmic Waves',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1614149162883-504ce4d13909?w=300&q=80',
      },
      {
        id: 104,
        title: 'Starfield',
        artist: 'Nova Dreams',
        durationSeconds: 289,
        albumTitle: 'Cosmic Waves',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1614149162883-504ce4d13909?w=300&q=80',
      },
    ],
  },
  {
    id: 2,
    title: 'Midnight Sessions',
    artist: 'Urban Echoes',
    cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80',
    releaseYear: 2024,
    genre: 'Lo-Fi',
    description: 'Late night beats for the nocturnal souls.',
    tracks: [
      {
        id: 201,
        title: 'City Lights',
        artist: 'Urban Echoes',
        durationSeconds: 225,
        albumTitle: 'Midnight Sessions',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80',
      },
      {
        id: 202,
        title: 'Rainy Streets',
        artist: 'Urban Echoes',
        durationSeconds: 198,
        albumTitle: 'Midnight Sessions',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80',
      },
      {
        id: 203,
        title: 'Neon Reflections',
        artist: 'Urban Echoes',
        durationSeconds: 267,
        albumTitle: 'Midnight Sessions',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80',
      },
    ],
  },
  {
    id: 3,
    title: 'Electric Dreams',
    artist: 'Synth Collective',
    cover: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=600&q=80',
    releaseYear: 2023,
    genre: 'Synthwave',
    description: 'Retro-futuristic synthwave vibes from the collective.',
    tracks: [
      {
        id: 301,
        title: 'Digital Sunrise',
        artist: 'Synth Collective',
        durationSeconds: 312,
        albumTitle: 'Electric Dreams',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=300&q=80',
      },
      {
        id: 302,
        title: 'Chromatic Pulse',
        artist: 'Synth Collective',
        durationSeconds: 278,
        albumTitle: 'Electric Dreams',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=300&q=80',
      },
    ],
  },
  {
    id: 4,
    title: 'Ocean Breeze',
    artist: 'Ambient Waves',
    cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&q=80',
    releaseYear: 2024,
    genre: 'Ambient',
    description: 'Peaceful ocean-inspired ambient compositions.',
    tracks: [
      {
        id: 401,
        title: 'Calm Waters',
        artist: 'Ambient Waves',
        durationSeconds: 363,
        albumTitle: 'Ocean Breeze',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&q=80',
      },
      {
        id: 402,
        title: 'Tidal Meditation',
        artist: 'Ambient Waves',
        durationSeconds: 420,
        albumTitle: 'Ocean Breeze',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&q=80',
      },
    ],
  },
  {
    id: 5,
    title: 'Night Drive',
    artist: 'Retrowave',
    cover: 'https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=600&q=80',
    releaseYear: 2023,
    genre: 'Retrowave',
    description: 'Cruising through neon-lit highways after dark.',
    tracks: [
      {
        id: 501,
        title: 'Neon Highways',
        artist: 'Retrowave',
        durationSeconds: 258,
        albumTitle: 'Night Drive',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=300&q=80',
      },
      {
        id: 502,
        title: 'Turbo Rush',
        artist: 'Retrowave',
        durationSeconds: 234,
        albumTitle: 'Night Drive',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=300&q=80',
      },
      {
        id: 503,
        title: 'Sunset Boulevard',
        artist: 'Retrowave',
        durationSeconds: 301,
        albumTitle: 'Night Drive',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3',
        coverArtUrl: 'https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=300&q=80',
      },
    ],
  },
];

// Demo playlists
export const playlists: Playlist[] = [
  {
    id: 1,
    title: 'Chill Vibes',
    description: 'Perfect for relaxing and unwinding',
    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&q=80',
    creatorName: 'KasShi',
    isPublic: true,
    createdAt: '2024-01-15',
    tracks: [
      albums[0].tracks[0], // Stellar Journey
      albums[1].tracks[0], // City Lights
      albums[3].tracks[0], // Calm Waters
    ],
  },
  {
    id: 2,
    title: 'Synthwave Essentials',
    description: 'The best of synthwave and retrowave',
    cover: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=600&q=80',
    creatorName: 'KasShi',
    isPublic: true,
    createdAt: '2024-02-20',
    tracks: [
      albums[2].tracks[0], // Digital Sunrise
      albums[4].tracks[0], // Neon Highways
      albums[4].tracks[1], // Turbo Rush
    ],
  },
  {
    id: 3,
    title: 'Late Night Coding',
    description: 'Focus music for those long coding sessions',
    cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80',
    creatorName: 'KasShi',
    isPublic: true,
    createdAt: '2024-03-10',
    tracks: [
      albums[0].tracks[1], // Nebula Drift
      albums[1].tracks[1], // Rainy Streets
      albums[2].tracks[1], // Chromatic Pulse
      albums[0].tracks[2], // Gravity Well
    ],
  },
];

// Demo podcasts
export const podcasts: Podcast[] = [
  {
    id: 1,
    title: 'Tech Talk Daily',
    host: 'Sarah Chen',
    cover: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=600&q=80',
    description: 'Your daily dose of tech news, interviews with industry leaders, and deep dives into the latest innovations shaping our digital world.',
    category: 'Technology',
    hasVideo: true,
    followerCount: 45200,
    episodes: [
      {
        id: 1001,
        title: 'The Future of AI in 2024',
        description: 'We explore the latest AI developments and what they mean for the future of work, creativity, and human-machine interaction.',
        durationSeconds: 2845,
        publishedAt: '2024-03-15',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        hasVideo: true,
        chapters: [
          { id: 1, title: 'Introduction', startTimeSeconds: 0 },
          { id: 2, title: 'AI in Creative Industries', startTimeSeconds: 420 },
          { id: 3, title: 'Interview: Dr. Maya Patel', startTimeSeconds: 980 },
          { id: 4, title: 'Ethical Considerations', startTimeSeconds: 1650 },
          { id: 5, title: 'Predictions for 2025', startTimeSeconds: 2200 },
        ],
      },
      {
        id: 1002,
        title: 'Web3 and the Decentralized Internet',
        description: 'Understanding blockchain technology beyond cryptocurrency and its potential to reshape the internet.',
        durationSeconds: 3120,
        publishedAt: '2024-03-12',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        hasVideo: true,
        chapters: [
          { id: 1, title: 'What is Web3?', startTimeSeconds: 0 },
          { id: 2, title: 'Beyond Crypto', startTimeSeconds: 600 },
          { id: 3, title: 'Real-World Applications', startTimeSeconds: 1400 },
          { id: 4, title: 'Challenges Ahead', startTimeSeconds: 2400 },
        ],
      },
      {
        id: 1003,
        title: 'The Rise of Electric Vehicles',
        description: 'How EVs are transforming transportation and what the infrastructure challenges look like.',
        durationSeconds: 2560,
        publishedAt: '2024-03-08',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
        hasVideo: false,
      },
    ],
  },
  {
    id: 2,
    title: 'Crypto Frontiers',
    host: 'Alex Morgan',
    cover: 'https://images.unsplash.com/photo-1639762681057-408e52192e55?w=600&q=80',
    description: 'Navigate the world of cryptocurrency, DeFi, and blockchain technology with expert analysis and market insights.',
    category: 'Finance',
    hasVideo: false,
    followerCount: 28900,
    episodes: [
      {
        id: 2001,
        title: 'Bitcoin Halving: What to Expect',
        description: 'Breaking down the upcoming Bitcoin halving event and its historical impact on market dynamics.',
        durationSeconds: 2100,
        publishedAt: '2024-03-14',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
        hasVideo: false,
        chapters: [
          { id: 1, title: 'Halving Explained', startTimeSeconds: 0 },
          { id: 2, title: 'Historical Analysis', startTimeSeconds: 450 },
          { id: 3, title: 'Market Predictions', startTimeSeconds: 1200 },
        ],
      },
      {
        id: 2002,
        title: 'DeFi Deep Dive: Yield Farming Strategies',
        description: 'Understanding yield farming, liquidity pools, and how to navigate DeFi safely.',
        durationSeconds: 2780,
        publishedAt: '2024-03-10',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
        hasVideo: false,
      },
    ],
  },
  {
    id: 3,
    title: 'Creative Minds',
    host: 'Jordan Lee',
    cover: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=600&q=80',
    description: 'Conversations with artists, designers, and creative professionals about their craft, inspiration, and creative process.',
    category: 'Arts',
    hasVideo: true,
    followerCount: 67500,
    episodes: [
      {
        id: 3001,
        title: 'Finding Your Creative Voice',
        description: 'How to develop an authentic artistic style and overcome creative blocks.',
        durationSeconds: 3400,
        publishedAt: '2024-03-13',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
        hasVideo: true,
        chapters: [
          { id: 1, title: 'Welcome', startTimeSeconds: 0 },
          { id: 2, title: 'Defining Authenticity', startTimeSeconds: 300 },
          { id: 3, title: 'Overcoming Blocks', startTimeSeconds: 1200 },
          { id: 4, title: 'Guest Interview', startTimeSeconds: 2000 },
          { id: 5, title: 'Practical Exercises', startTimeSeconds: 2800 },
        ],
      },
      {
        id: 3002,
        title: 'The Business of Art',
        description: 'Balancing creativity with commerce: pricing your work, finding clients, and building a sustainable creative career.',
        durationSeconds: 2950,
        publishedAt: '2024-03-06',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
        hasVideo: true,
      },
      {
        id: 3003,
        title: 'Collaboration vs Solo Work',
        description: 'The pros and cons of creative partnerships and how to make collaborations work.',
        durationSeconds: 2400,
        publishedAt: '2024-02-28',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
        hasVideo: false,
      },
    ],
  },
  {
    id: 4,
    title: 'Future Forward',
    host: 'Maya Patel',
    cover: 'https://images.unsplash.com/photo-1531973576160-7125cd663d86?w=600&q=80',
    description: 'Exploring emerging technologies, scientific breakthroughs, and the innovations that will shape tomorrow.',
    category: 'Science',
    hasVideo: false,
    followerCount: 34100,
    episodes: [
      {
        id: 4001,
        title: 'Quantum Computing Simplified',
        description: 'Breaking down quantum computing concepts for everyone and exploring its real-world applications.',
        durationSeconds: 2650,
        publishedAt: '2024-03-11',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
        hasVideo: false,
        chapters: [
          { id: 1, title: 'Intro to Quantum', startTimeSeconds: 0 },
          { id: 2, title: 'Qubits Explained', startTimeSeconds: 500 },
          { id: 3, title: 'Current State', startTimeSeconds: 1300 },
          { id: 4, title: 'Future Applications', startTimeSeconds: 2000 },
        ],
      },
      {
        id: 4002,
        title: 'Space Exploration in the 2020s',
        description: 'From Mars missions to commercial space travel, the new era of human space exploration.',
        durationSeconds: 3200,
        publishedAt: '2024-03-04',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
        hasVideo: false,
      },
    ],
  },
];

// Helper to get album by ID
export const getAlbumById = (id: number): Album | undefined => {
  return albums.find((a) => a.id === id);
};

// Helper to get playlist by ID
export const getPlaylistById = (id: number): Playlist | undefined => {
  return playlists.find((p) => p.id === id);
};

// Helper to get podcast by ID
export const getPodcastById = (id: number): Podcast | undefined => {
  return podcasts.find((p) => p.id === id);
};

// Format duration as mm:ss
export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Format long duration as Xhr Ymin
export const formatLongDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins} min`;
};

// Get total duration of tracks
export const getTotalDuration = (tracks: AudioTrack[]): string => {
  const totalSeconds = tracks.reduce((acc, t) => acc + t.durationSeconds, 0);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} hr ${mins} min`;
  }
  return `${mins} min`;
};

// Format date for display
export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Format subscriber count
export const formatSubscribers = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
};
