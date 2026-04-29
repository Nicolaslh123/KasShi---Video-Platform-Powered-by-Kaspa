export interface Video {
  id: string;
  title: string;
  thumbnail: string;
  channelName: string;
  channelAvatar: string;
  channelId: string;
  views: number;
  uploadedAt: string;
  duration: string;
  kasEarned: number;
}

export const stubVideos: Video[] = [
  {
    id: "1",
    title: "How Kaspa's BlockDAG Changes Everything About Crypto",
    thumbnail: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=640&h=360&fit=crop",
    channelName: "Crypto Explained",
    channelAvatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop",
    channelId: "crypto-explained",
    views: 124500,
    uploadedAt: "2 days ago",
    duration: "12:34",
    kasEarned: 1245.5
  },
  {
    id: "2",
    title: "Building a Web3 App in 10 Minutes - Complete Tutorial",
    thumbnail: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=640&h=360&fit=crop",
    channelName: "DevMaster",
    channelAvatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
    channelId: "devmaster",
    views: 89200,
    uploadedAt: "5 days ago",
    duration: "10:15",
    kasEarned: 892.0
  },
  {
    id: "3",
    title: "Why I Quit My Job to Create Content Full-Time",
    thumbnail: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=640&h=360&fit=crop",
    channelName: "Life Updates",
    channelAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
    channelId: "life-updates",
    views: 256000,
    uploadedAt: "1 week ago",
    duration: "18:42",
    kasEarned: 2560.0
  },
  {
    id: "4",
    title: "The Future of Decentralized Video Platforms",
    thumbnail: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=640&h=360&fit=crop",
    channelName: "Tech Tomorrow",
    channelAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
    channelId: "tech-tomorrow",
    views: 45600,
    uploadedAt: "3 days ago",
    duration: "8:55",
    kasEarned: 456.0
  },
  {
    id: "5",
    title: "Mining Kaspa: Complete Setup Guide 2024",
    thumbnail: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=640&h=360&fit=crop",
    channelName: "Mining Pro",
    channelAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop",
    channelId: "mining-pro",
    views: 178900,
    uploadedAt: "1 day ago",
    duration: "24:18",
    kasEarned: 1789.0
  },
  {
    id: "6",
    title: "Relaxing Mountain Scenery - 4K Nature Ambience",
    thumbnail: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=640&h=360&fit=crop",
    channelName: "Nature Vibes",
    channelAvatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop",
    channelId: "nature-vibes",
    views: 523000,
    uploadedAt: "2 weeks ago",
    duration: "1:02:15",
    kasEarned: 5230.0
  },
  {
    id: "7",
    title: "How to Earn Passive Income with Kaspa Staking",
    thumbnail: "https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=640&h=360&fit=crop",
    channelName: "Crypto Wealth",
    channelAvatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop",
    channelId: "crypto-wealth",
    views: 67800,
    uploadedAt: "4 days ago",
    duration: "15:30",
    kasEarned: 678.0
  },
  {
    id: "8",
    title: "Lo-Fi Beats to Code/Relax To - 24/7 Live Stream",
    thumbnail: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=640&h=360&fit=crop",
    channelName: "Chill Beats",
    channelAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
    channelId: "chill-beats",
    views: 1250000,
    uploadedAt: "Live",
    duration: "LIVE",
    kasEarned: 12500.0
  },
  {
    id: "9",
    title: "I Tried Living on Crypto for 30 Days - Here's What Happened",
    thumbnail: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=640&h=360&fit=crop",
    channelName: "Social Experiment",
    channelAvatar: "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=100&h=100&fit=crop",
    channelId: "social-experiment",
    views: 892000,
    uploadedAt: "5 days ago",
    duration: "32:45",
    kasEarned: 8920.0
  },
  {
    id: "10",
    title: "Smart Contract Development on Kaspa - Deep Dive",
    thumbnail: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=640&h=360&fit=crop",
    channelName: "Blockchain Dev",
    channelAvatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&h=100&fit=crop",
    channelId: "blockchain-dev",
    views: 34500,
    uploadedAt: "6 days ago",
    duration: "45:12",
    kasEarned: 345.0
  },
  {
    id: "11",
    title: "Cooking Authentic Japanese Ramen from Scratch",
    thumbnail: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=640&h=360&fit=crop",
    channelName: "Foodie Adventures",
    channelAvatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop",
    channelId: "foodie-adventures",
    views: 445000,
    uploadedAt: "1 week ago",
    duration: "22:30",
    kasEarned: 4450.0
  },
  {
    id: "12",
    title: "The Psychology of Crypto Markets - Why We FOMO",
    thumbnail: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=640&h=360&fit=crop",
    channelName: "Mind & Money",
    channelAvatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop",
    channelId: "mind-money",
    views: 156000,
    uploadedAt: "3 days ago",
    duration: "19:45",
    kasEarned: 1560.0
  }
];

export const categories = [
  "All",
  "Crypto",
  "Technology",
  "Gaming",
  "Music",
  "Education",
  "Entertainment",
  "News",
  "Sports",
  "Lifestyle"
];
