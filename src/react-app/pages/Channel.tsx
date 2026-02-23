import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import VideoCard from "../components/VideoCard";
import { WalletModal } from "../components/WalletModal";
import { SecurityVerificationModal } from "../components/SecurityVerificationModal";
import { ImageCropper } from "../components/ImageCropper";
import { 
  useChannel, 
  useChannelVideos,
  useChannelTiers,
  useMembershipStatus,
  useMyVideos,
  formatKas,
  DEFAULT_AVATAR,
  MembershipTier,
} from "../hooks/useKasShi";
import { useWallet } from "../contexts/WalletContext";
import { usePayment } from "../hooks/usePayment";
import { Share2, Bell, Loader2, Gift, X, Crown, Star, Sparkles, Plus, Check, Settings, Save, ImageIcon, Upload, ChevronDown, ChevronUp, Link2, ExternalLink, Trash2, Heart, Video, EyeOff, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import { KaspaIcon } from "../components/KasShiLogo";

// Membership Status Card Component - One-time purchase model
function MembershipStatusCard({ 
  membership,
  onRenew
}: { 
  membership: { tierName: string; expiresAt: string; tierPrice?: string };
  onRenew?: () => void;
}) {
  const isExpiringSoon = new Date(membership.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000; // 7 days
  const isExpired = new Date(membership.expiresAt).getTime() < Date.now();

  return (
    <div className={`mb-8 p-6 bg-gradient-to-r ${isExpired ? 'from-red-500/10 to-orange-500/10 border-red-500/30' : 'from-amber-500/10 to-orange-500/10 border-amber-500/30'} border rounded-2xl`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Crown className={`w-6 h-6 ${isExpired ? 'text-red-400' : 'text-amber-400'}`} />
            <h3 className="text-lg font-bold text-white">
              {isExpired ? `Your ${membership.tierName} membership expired` : `You're a ${membership.tierName} member!`}
            </h3>
          </div>
          <p className="text-slate-300 text-sm">
            {isExpired ? (
              <>Expired on {new Date(membership.expiresAt).toLocaleDateString()}</>
            ) : isExpiringSoon ? (
              <>⚠️ Expires {new Date(membership.expiresAt).toLocaleDateString()} — renew to keep access</>
            ) : (
              <>Access until {new Date(membership.expiresAt).toLocaleDateString()}</>
            )}
          </p>
        </div>
        
        {onRenew && (isExpiringSoon || isExpired) && (
          <button
            onClick={onRenew}
            className={`px-4 py-2 text-sm ${isExpired ? 'bg-primary/20 hover:bg-primary/30 text-primary' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400'} rounded-lg transition-colors font-medium`}
          >
            {isExpired ? 'Renew Access' : 'Renew Membership'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Channel() {
  const { channelId } = useParams();
  const { channel, loading: channelLoading, refetch: refetchChannel } = useChannel(channelId);
  const { videos, loading: videosLoading } = useChannelVideos(channelId);
  const { tiers, loading: tiersLoading, refetch: refetchTiers } = useChannelTiers(channelId);
  const { isConnected, balance, micropay, channel: viewerChannel, externalWallet, refreshPendingBalance } = useWallet();
  const { pay, isExternalWallet } = usePayment();
  const { membership, refetch: refetchMembership } = useMembershipStatus(channelId, viewerChannel?.id ?? null);
  
  // Unified payment function that handles both internal and external wallets
  const unifiedPay = useCallback(async (
    toAddress: string,
    amount: number,
    videoIdParam?: string,
    paymentType?: string,
    recipientChannelId?: number,
    commentId?: number
  ) => {
    if (isExternalWallet) {
      return pay(toAddress, amount, {
        videoId: videoIdParam,
        paymentType,
        recipientChannelId,
        commentId,
      });
    } else {
      return micropay(toAddress, amount, videoIdParam, paymentType, recipientChannelId, commentId);
    }
  }, [isExternalWallet, pay, micropay]);
  
  const isChannelOwner = viewerChannel?.id === channel?.id;
  const { videos: myVideos, loading: myVideosLoading } = useMyVideos(channelId, isChannelOwner, externalWallet?.authToken);
  
  const [activeTab, setActiveTab] = useState<"videos" | "my-videos" | "membership" | "about" | "liked">("videos");
  const [likedVideos, setLikedVideos] = useState<any[]>([]);
  const [likedVideosLoading, setLikedVideosLoading] = useState(false);
  const [showEditSection, setShowEditSection] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [isTipping, setIsTipping] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [joiningTierId, setJoiningTierId] = useState<number | null>(null);
  
  // Security verification state
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [pendingTip, setPendingTip] = useState<{ amount: number; address: string } | null>(null);
  const [pendingMembership, setPendingMembership] = useState<MembershipTier | null>(null);
  
  // For channel owners - create tier modal
  const [showCreateTierModal, setShowCreateTierModal] = useState(false);
  const [newTierName, setNewTierName] = useState("");
  const [newTierPrice, setNewTierPrice] = useState("");
  const [newTierDescription, setNewTierDescription] = useState("");
  const [newTierBenefits, setNewTierBenefits] = useState("");
  const [isCreatingTier, setIsCreatingTier] = useState(false);
  
  // Edit channel state
  const [editName, setEditName] = useState("");
  const [editHandle, setEditHandle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAbout, setEditAbout] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editBannerUrl, setEditBannerUrl] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  
  // Subscription state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  
  // Notification bell state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [togglingNotifications, setTogglingNotifications] = useState(false);
  
  // Channel links state
  const [channelLinks, setChannelLinks] = useState<Array<{id: number; title: string; url: string; icon: string | null}>>([]);
  const [showLinksModal, setShowLinksModal] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  
  // Image cropper state
  const [showAvatarCropper, setShowAvatarCropper] = useState(false);
  const [avatarFileToProcess, setAvatarFileToProcess] = useState<File | null>(null);
  const [showBannerCropper, setShowBannerCropper] = useState(false);
  const [bannerFileToProcess, setBannerFileToProcess] = useState<File | null>(null);
  
  // Share dropdown state
  const [showShareMenu, setShowShareMenu] = useState(false);
  
  // Fee constants - external wallets need 0.1 KAS minimum (KIP-9), internal wallets batch small amounts
  const MIN_ONCHAIN_FEE = 0.1; // Minimum for KIP-9 compliance
  const EDIT_FEE_KAS = isExternalWallet ? MIN_ONCHAIN_FEE : 0.0001; // External: on-chain, Internal: batched
  const SUBSCRIBE_FEE_KAS = 0.5; // 100% to creator (always on-chain, already >= 0.1)
  const UNSUBSCRIBE_FEE_KAS = isExternalWallet ? MIN_ONCHAIN_FEE : 0.0001; // External: on-chain, Internal: batched
  
  // Platform wallet for fees (fetched dynamically)
  const [platformWallet, setPlatformWallet] = useState<string | null>(null);
  
  useEffect(() => {
    fetch("/api/platform-wallet")
      .then(res => res.json())
      .then(data => setPlatformWallet(data.walletAddress))
      .catch(err => console.error("Failed to fetch platform wallet:", err));
  }, []);

  // Populate edit fields when channel loads
  useEffect(() => {
    if (channel && isChannelOwner) {
      setEditName(channel.name || "");
      setEditHandle(channel.handle || "");
      setEditDescription(channel.description || "");
      setEditAbout(channel.about || "");
      setEditAvatarUrl(channel.avatarUrl || "");
      setEditBannerUrl(channel.bannerUrl || "");
    }
  }, [channel, isChannelOwner]);

  // Check subscription status
  useEffect(() => {
    const checkSubscription = async () => {
      if (!channel || !viewerChannel || isChannelOwner) {
        setSubscriptionChecked(true);
        return;
      }
      try {
        const res = await fetch(`/api/kasshi/channels/${channel.handle}/subscription?subscriberChannelId=${viewerChannel.id}`);
        if (res.ok) {
          const data = await res.json();
          setIsSubscribed(data.subscribed);
        }
      } catch (err) {
        console.error("Failed to check subscription:", err);
      } finally {
        setSubscriptionChecked(true);
      }
    };
    checkSubscription();
  }, [channel, viewerChannel, isChannelOwner]);

  // Check notification bell status
  useEffect(() => {
    const checkNotifications = async () => {
      if (!channel || !viewerChannel || isChannelOwner) return;
      try {
        const res = await fetch(`/api/kasshi/channels/${channel.handle}/notifications?subscriberChannelId=${viewerChannel.id}`);
        if (res.ok) {
          const data = await res.json();
          setNotificationsEnabled(data.subscribed);
        }
      } catch (err) {
        console.error("Failed to check notification status:", err);
      }
    };
    checkNotifications();
  }, [channel, viewerChannel, isChannelOwner]);

  // Fetch channel links
  useEffect(() => {
    const fetchLinks = async () => {
      if (!channel) return;
      try {
        const res = await fetch(`/api/kasshi/channels/${channel.handle}/links`);
        if (res.ok) {
          const data = await res.json();
          setChannelLinks(data.links);
        }
      } catch (err) {
        console.error("Failed to fetch channel links:", err);
      }
    };
    fetchLinks();
  }, [channel]);

  // Click outside handler for share menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showShareMenu && !target.closest('[data-share-dropdown]')) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showShareMenu]);

  // Fetch liked videos when tab is selected (only for channel owner)
  useEffect(() => {
    const fetchLikedVideos = async () => {
      if (activeTab !== "liked" || !channel || !isChannelOwner) return;
      
      setLikedVideosLoading(true);
      try {
        const res = await fetch(`/api/kasshi/channels/${channel.handle}/liked`);
        if (res.ok) {
          const data = await res.json();
          setLikedVideos(data.videos || []);
        }
      } catch (err) {
        console.error("Failed to fetch liked videos:", err);
      } finally {
        setLikedVideosLoading(false);
      }
    };
    fetchLikedVideos();
  }, [activeTab, channel, isChannelOwner]);

  // Toggle notification bell
  const handleToggleNotifications = async () => {
    if (!channel || !isConnected) {
      setIsWalletModalOpen(true);
      return;
    }
    
    setTogglingNotifications(true);
    try {
      const headers: Record<string, string> = {};
      if (externalWallet?.authToken) {
        headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch(`/api/kasshi/channels/${channel.handle}/notifications`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to toggle notifications");
      
      setNotificationsEnabled(data.subscribed);
      toast.success(data.subscribed ? "Notifications enabled" : "Notifications disabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle notifications");
    } finally {
      setTogglingNotifications(false);
    }
  };

  // Add channel link
  const handleAddLink = async () => {
    if (!channel || !newLinkTitle.trim() || !newLinkUrl.trim()) return;
    
    setAddingLink(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (externalWallet?.authToken) {
        headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch(`/api/kasshi/channels/${channel.id}/links`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ title: newLinkTitle.trim(), url: newLinkUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add link");
      
      setChannelLinks([...channelLinks, data]);
      setNewLinkTitle("");
      setNewLinkUrl("");
      toast.success("Link added!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add link");
    } finally {
      setAddingLink(false);
    }
  };

  // Delete channel link
  const handleDeleteLink = async (linkId: number) => {
    if (!channel) return;
    try {
      const headers: Record<string, string> = {};
      if (externalWallet?.authToken) {
        headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch(`/api/kasshi/channels/${channel.id}/links/${linkId}`, {
        method: "DELETE",
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete link");
      
      setChannelLinks(channelLinks.filter(l => l.id !== linkId));
      toast.success("Link removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete link");
    }
  };

  // Handle subscribe/unsubscribe
  const handleSubscribe = async () => {
    if (!channel) return;
    
    if (!isConnected) {
      toast.error("Please sign in to subscribe to channels");
      return;
    }
    
    if (!viewerChannel) {
      toast.error("You need to create a channel first before subscribing to others. Go to Settings to create your channel.");
      return;
    }
    
    const fee = isSubscribed ? UNSUBSCRIBE_FEE_KAS : SUBSCRIBE_FEE_KAS;
    
    if (parseFloat(balance) < fee) {
      toast.error("Insufficient balance");
      return;
    }
    
    setIsSubscribing(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (externalWallet?.authToken) {
        headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch(`/api/kasshi/channels/${channel.handle}/subscribe`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ subscriberChannelId: viewerChannel.id }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update subscription");
      
      setIsSubscribed(data.subscribed);
      toast.success(
        data.subscribed 
          ? `Subscribed! Paid ${data.paidKas} KAS to ${channel.name}`
          : `Unsubscribed. Paid ${data.paidKas} KAS.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update subscription");
    } finally {
      setIsSubscribing(false);
    }
  };

  // Open cropper when user selects avatar file
  const handleAvatarFileSelect = (file: File) => {
    setAvatarFileToProcess(file);
    setShowAvatarCropper(true);
  };

  // Upload the cropped avatar
  const handleCroppedAvatarUpload = async (croppedFile: File) => {
    if (!channel) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", croppedFile);
      formData.append("channelId", channel.id.toString());
      formData.append("type", "avatar");
      
      const res = await fetch("/api/kasshi/upload/channel-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      
      setEditAvatarUrl(data.url);
      toast.success("Avatar uploaded!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAvatar(false);
      setAvatarFileToProcess(null);
    }
  };

  // Open cropper when user selects banner file
  const handleBannerFileSelect = (file: File) => {
    setBannerFileToProcess(file);
    setShowBannerCropper(true);
  };

  // Upload the cropped banner
  const handleCroppedBannerUpload = async (croppedFile: File) => {
    if (!channel) return;
    setUploadingBanner(true);
    try {
      const formData = new FormData();
      formData.append("file", croppedFile);
      formData.append("channelId", channel.id.toString());
      formData.append("type", "banner");
      
      const res = await fetch("/api/kasshi/upload/channel-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      
      setEditBannerUrl(data.url);
      toast.success("Banner uploaded!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingBanner(false);
      setBannerFileToProcess(null);
    }
  };

  const handleEditChannel = async () => {
    if (!isConnected) {
      setIsWalletModalOpen(true);
      return;
    }
    
    if (parseFloat(balance ?? "0") < EDIT_FEE_KAS) {
      toast.error("Insufficient balance");
      return;
    }
    
    setIsSavingEdit(true);
    
    try {
      // Pay the edit fee to platform
      if (!platformWallet) {
        throw new Error("Platform wallet not configured. Please contact the administrator.");
      }
      const paymentResult = await unifiedPay(platformWallet, EDIT_FEE_KAS, undefined, "channel_edit", undefined, undefined);
      console.log("Edit channel payment result:", paymentResult);
      if (!paymentResult.success) {
        if (paymentResult.needsConsolidation) {
          // Show both the consolidation message AND the actual error for debugging
          console.error("Edit channel payment needs consolidation. Error:", paymentResult.error);
          toast.error(`Transaction failed: ${paymentResult.error || "Too many UTXOs"}. Please consolidate your wallet in Settings.`, { duration: 8000 });
          return;
        }
        // Show the actual error from the network for debugging
        console.error("Edit channel payment failed:", paymentResult.error);
        throw new Error(paymentResult.error || "Payment failed");
      }
      
      // Build update payload with all fields
      const updates: Record<string, string> = {
        name: editName.trim(),
        handle: editHandle.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""),
        description: editDescription.trim(),
        about: editAbout.trim(),
        avatarUrl: editAvatarUrl.trim(),
        bannerUrl: editBannerUrl.trim(),
      };
      
      const patchHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (externalWallet?.authToken) {
        patchHeaders["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch(`/api/kasshi/channels/${channel!.id}`, {
        method: "PATCH",
        headers: patchHeaders,
        credentials: "include",
        body: JSON.stringify(updates),
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update channel");
      }
      
      toast.success("Channel updated!");
      // Refresh channel data and pending balance without page reload
      refetchChannel();
      refreshPendingBalance();
      setShowEditSection(false);
    } catch (error) {
      console.error("Edit channel failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update channel");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleTip = async () => {
    const amount = parseFloat(tipAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid tip amount");
      return;
    }
    
    if (!isConnected) {
      setIsWalletModalOpen(true);
      setShowTipModal(false);
      toast.error("Connect wallet to tip");
      return;
    }
    
    if (balance === null || parseFloat(balance) < amount) {
      toast.error("Insufficient balance");
      return;
    }
    
    if (!channel?.walletAddress) {
      toast.error("Creator has no wallet configured");
      return;
    }
    
    // Store pending tip and show security modal
    setPendingTip({ amount, address: channel.walletAddress });
    setShowTipModal(false);
    setShowSecurityModal(true);
  };

  const executeTip = useCallback(async () => {
    if (!pendingTip) return;
    
    setShowSecurityModal(false);
    setIsTipping(true);
    
    try {
      const paymentResult = await unifiedPay(pendingTip.address, pendingTip.amount, "", "tip", channel?.id);
      if (!paymentResult.success) {
        if (paymentResult.needsConsolidation) {
          toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings before continuing.", { duration: 6000 });
          return;
        }
        throw new Error(paymentResult.error || "Tip failed");
      }
      toast.success("Tip sent!");
      setTipAmount("");
    } catch (error) {
      console.error("Tip failed:", error);
      toast.error(error instanceof Error ? error.message : "Tip failed");
    } finally {
      setIsTipping(false);
      setPendingTip(null);
    }
  }, [pendingTip, micropay, channel?.name]);

  const handleJoinMembership = async (tier: MembershipTier) => {
    if (!isConnected) {
      setIsWalletModalOpen(true);
      toast.error("Connect wallet to join membership");
      return;
    }
    
    const price = parseFloat(tier.priceKas);
    if (balance === null || parseFloat(balance) < price) {
      toast.error("Insufficient balance");
      return;
    }
    
    if (!viewerChannel) {
      toast.error("Create a channel first to join memberships");
      return;
    }
    
    // Store pending membership and show security modal
    setPendingMembership(tier);
    setShowSecurityModal(true);
  };

  const executeJoinMembership = useCallback(async () => {
    if (!pendingMembership) return;
    
    setShowSecurityModal(false);
    setJoiningTierId(pendingMembership.id);
    
    try {
      const joinHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (externalWallet?.authToken) {
        joinHeaders["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch(`/api/kasshi/channels/${channelId}/join`, {
        method: "POST",
        headers: joinHeaders,
        credentials: "include",
        body: JSON.stringify({ tierId: pendingMembership.id }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to join membership");
      }
      
      toast.success(`Welcome to ${pendingMembership.name}! 🎉`);
      refetchMembership();
      refetchTiers();
    } catch (error) {
      console.error("Join membership failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to join membership");
    } finally {
      setJoiningTierId(null);
      setPendingMembership(null);
    }
  }, [pendingMembership, channelId, refetchMembership, refetchTiers]);

  const handleCreateTier = async () => {
    if (!newTierName.trim() || !newTierPrice) {
      toast.error("Name and price are required");
      return;
    }
    
    const price = parseFloat(newTierPrice);
    if (isNaN(price) || price <= 0) {
      toast.error("Enter a valid price");
      return;
    }
    
    if (!isConnected) {
      setIsWalletModalOpen(true);
      return;
    }
    
    if (parseFloat(balance ?? "0") < EDIT_FEE_KAS) {
      toast.error("Insufficient balance");
      return;
    }
    
    setIsCreatingTier(true);
    
    try {
      // Pay the creation fee to platform
      if (!platformWallet) {
        throw new Error("Platform wallet not configured. Please contact the administrator.");
      }
      const paymentResult = await unifiedPay(platformWallet, EDIT_FEE_KAS, undefined, "tier_create", undefined, undefined);
      if (!paymentResult.success) {
        if (paymentResult.needsConsolidation) {
          toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings before continuing.", { duration: 6000 });
          return;
        }
        throw new Error(paymentResult.error || "Payment failed");
      }
      
      const benefits = newTierBenefits
        .split("\n")
        .map(b => b.trim())
        .filter(b => b.length > 0);
      
      const tierHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (externalWallet?.authToken) {
        tierHeaders["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch(`/api/kasshi/channels/${channelId}/tiers`, {
        method: "POST",
        headers: tierHeaders,
        credentials: "include",
        body: JSON.stringify({
          name: newTierName.trim(),
          priceKas: price,
          description: newTierDescription.trim() || null,
          benefits,
          durationDays: 30,
        }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to create tier");
      }
      
      toast.success("Membership tier created!");
      setShowCreateTierModal(false);
      setNewTierName("");
      setNewTierPrice("");
      setNewTierDescription("");
      setNewTierBenefits("");
      refetchTiers();
    } catch (error) {
      console.error("Create tier failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create tier");
    } finally {
      setIsCreatingTier(false);
    }
  };

  if (channelLoading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col">
        <Navbar />
        <div className="flex items-center justify-center pt-40">
          <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col">
        <Navbar />
        <div className="flex flex-col items-center justify-center pt-40">
          <h1 className="text-2xl font-bold text-white mb-2">Channel not found</h1>
          <p className="text-slate-400 mb-6">This channel may have been removed or doesn't exist.</p>
          <Link to="/" className="px-6 py-2 bg-teal-500 hover:bg-teal-400 text-white rounded-full font-medium transition-colors">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const avatar = channel.avatarUrl || DEFAULT_AVATAR;
  const walletShort = channel.walletAddress 
    ? `${channel.walletAddress.slice(0, 10)}...${channel.walletAddress.slice(-6)}`
    : "kaspa:qr49...7mxk";

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col">
      <Navbar />
      
      <main className="pt-16">
        {/* Channel banner */}
        <div className="h-48 md:h-64 bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 relative overflow-hidden">
          {channel.bannerUrl ? (
            <img 
              src={channel.bannerUrl} 
              alt="Banner" 
              className="w-full h-full object-cover object-center"
              style={{ imageRendering: 'auto' }}
            />
          ) : (
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1920&h=400&fit=crop')] bg-cover bg-center opacity-30" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
        </div>

        {/* Channel info */}
        <div className="max-w-[2000px] mx-auto px-4">
          {/* Channel info card with proper separation from banner */}
          <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 -mt-20 relative z-10 shadow-xl">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <img 
              src={avatar}
              alt={channel.name}
              className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover border-4 border-slate-800 shadow-xl -mt-16 md:-mt-20"
            />

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold text-white">
                  {channel.name}
                </h1>
                
              </div>
              
              <p className="text-slate-400 mt-1">@{channel.handle}</p>
              
              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-400">
                <span>{channel.subscriberCount.toLocaleString()} subscribers</span>
                <span>•</span>
                <span>{channel.videoCount || videos.length} videos</span>
                {isChannelOwner && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-teal-400">
                      <KaspaIcon size={16} />
                      {formatKas(channel.totalKasEarned)} KAS earned total
                    </span>
                  </>
                )}
              </div>

              <p className="text-slate-300 mt-4 max-w-2xl text-sm leading-relaxed">
                {channel.description || "This creator hasn't added a description yet."}
              </p>

              <div className="flex items-center gap-3 mt-6">
                {!isChannelOwner && subscriptionChecked && (
                  <>
                    <button 
                      onClick={handleSubscribe}
                      disabled={isSubscribing}
                      className={`px-6 py-2.5 rounded-full font-semibold transition-colors flex items-center gap-2 ${
                        isSubscribed 
                          ? "bg-slate-700 text-white hover:bg-red-600" 
                          : "bg-white text-slate-900 hover:bg-slate-200"
                      }`}
                    >
                      {isSubscribing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isSubscribed ? (
                        <>
                          <Check className="w-4 h-4" />
                          Subscribed
                        </>
                      ) : (
                        `Subscribe · ${SUBSCRIBE_FEE_KAS} KAS`
                      )}
                    </button>
                    <button 
                      onClick={() => setShowTipModal(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 rounded-full text-white font-semibold transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
                    >
                      <Gift className="w-5 h-5" />
                      Tip
                    </button>
                    <button 
                      onClick={handleToggleNotifications}
                      disabled={togglingNotifications}
                      className={`p-2.5 rounded-full text-white transition-colors ${
                        notificationsEnabled 
                          ? "bg-teal-600 hover:bg-teal-500" 
                          : "bg-slate-800 hover:bg-slate-700"
                      }`}
                      title={notificationsEnabled ? "Notifications enabled" : "Get notified of new uploads"}
                    >
                      {togglingNotifications ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : notificationsEnabled ? (
                        <Bell className="w-5 h-5 fill-current" />
                      ) : (
                        <Bell className="w-5 h-5" />
                      )}
                    </button>
                  </>
                )}
                {/* Links button - shows channel links */}
                {channelLinks.length > 0 && (
                  <button 
                    onClick={() => setShowLinksModal(true)}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-full text-white transition-colors"
                    title="Channel links"
                  >
                    <Link2 className="w-5 h-5" />
                  </button>
                )}
                <div className="relative" data-share-dropdown>
                  <button 
                    onClick={() => setShowShareMenu(!showShareMenu)}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-full text-white transition-colors"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                  {showShareMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-slate-800 rounded-xl border border-slate-700 shadow-xl z-50 overflow-hidden">
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/channel/${channel?.handle}`;
                          navigator.clipboard.writeText(url);
                          toast.success("Link copied to clipboard!");
                          setShowShareMenu(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-3"
                      >
                        <Link2 className="w-4 h-4" />
                        Copy link
                      </button>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/channel/${channel?.handle}`;
                          const text = `Check out ${channel?.name} on KasShi!`;
                          window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
                          setShowShareMenu(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-3"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        Share on X
                      </button>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/channel/${channel?.handle}`;
                          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
                          setShowShareMenu(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-3"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                        Share on Facebook
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Wallet address card + Edit section - Owner Only */}
            {isChannelOwner && (
            <div className="md:self-end flex flex-col gap-3">
              <div className="p-4 bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-700">
                <p className="text-xs text-slate-400 mb-1">Your Wallet</p>
                <div className="flex items-center gap-2">
                  <KaspaIcon size={20} />
                  <code className="text-sm text-teal-400 font-mono">
                    {walletShort}
                  </code>
                </div>
              </div>
              
              {/* Edit Channel Toggle */}
              <button
                onClick={() => setShowEditSection(!showEditSection)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-medium transition-colors border border-slate-700"
              >
                <Settings className="w-4 h-4" />
                Edit Channel
                {showEditSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            )}
          </div>
          </div>
          
          {/* Inline Edit Section - Owner Only */}
          {isChannelOwner && showEditSection && (
            <div className="mt-6 bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <Settings className="w-5 h-5 text-teal-400" />
                <h3 className="text-lg font-semibold text-white">Edit Channel</h3>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-4">
                  {/* Channel Name */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Channel Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Your channel name"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>

                  {/* Channel Handle */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Handle</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">@</span>
                      <input
                        type="text"
                        value={editHandle}
                        onChange={(e) => setEditHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                        placeholder="yourhandle"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Letters, numbers, and underscores only</p>
                  </div>

                  {/* Channel Description */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="A short description for your channel"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                    <p className="text-xs text-slate-500 mt-1">Shown below your subscriber count</p>
                  </div>

                  {/* About Section */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">About</label>
                    <textarea
                      value={editAbout}
                      onChange={(e) => setEditAbout(e.target.value)}
                      placeholder="Tell viewers more about yourself and your content..."
                      rows={5}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                    />
                    <p className="text-xs text-slate-500 mt-1">Shown in the About tab</p>
                  </div>
                </div>

                {/* Right Column - Image Uploads */}
                <div className="space-y-4">
                  {/* Avatar Upload */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        Avatar
                      </div>
                    </label>
                    <div className="flex items-center gap-4">
                      <img 
                        src={editAvatarUrl || channel.avatarUrl || DEFAULT_AVATAR} 
                        alt="Avatar preview" 
                        className="w-16 h-16 rounded-full object-cover border-2 border-slate-700"
                        onError={(e) => (e.currentTarget.src = DEFAULT_AVATAR)}
                      />
                      <label className="flex-1 cursor-pointer">
                        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors">
                          {uploadingAvatar ? (
                            <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
                          ) : (
                            <Upload className="w-5 h-5 text-slate-400" />
                          )}
                          <span className="text-sm text-slate-300">
                            {uploadingAvatar ? "Uploading..." : "Upload Avatar"}
                          </span>
                        </div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAvatarFileSelect(file);
                          }}
                          disabled={uploadingAvatar}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">PNG, JPG, or WebP. Max 5MB.</p>
                  </div>

                  {/* Banner Upload */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        Banner
                      </div>
                    </label>
                    <div className="space-y-3">
                      {(editBannerUrl || channel.bannerUrl) && (
                        <img 
                          src={editBannerUrl || channel.bannerUrl || undefined} 
                          alt="Banner preview" 
                          className="w-full h-20 object-cover rounded-xl border border-slate-700"
                        />
                      )}
                      <label className="block cursor-pointer">
                        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors">
                          {uploadingBanner ? (
                            <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
                          ) : (
                            <Upload className="w-5 h-5 text-slate-400" />
                          )}
                          <span className="text-sm text-slate-300">
                            {uploadingBanner ? "Uploading..." : "Upload Banner"}
                          </span>
                        </div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleBannerFileSelect(file);
                          }}
                          disabled={uploadingBanner}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">PNG, JPG, or WebP. Max 10MB. Recommended 1920x400.</p>
                  </div>
                </div>
              </div>

              {/* Channel Links Section */}
              <div className="mt-6 pt-6 border-t border-slate-700">
                <div className="flex items-center gap-2 mb-4">
                  <Link2 className="w-5 h-5 text-teal-400" />
                  <h4 className="text-md font-semibold text-white">Channel Links</h4>
                </div>
                <p className="text-sm text-slate-400 mb-4">Add links to your social media, website, or other platforms.</p>

                {/* Existing Links */}
                {channelLinks.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {channelLinks.map(link => (
                      <div 
                        key={link.id} 
                        className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-xl group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                            <ExternalLink className="w-4 h-4 text-teal-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white truncate">{link.title}</p>
                            <p className="text-xs text-slate-500 truncate">{link.url}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteLink(link.id)}
                          className="p-2 hover:bg-red-500/20 rounded-lg transition-colors opacity-60 hover:opacity-100"
                          title="Delete link"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Link */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr,1.5fr,auto] gap-3 items-end">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Title</label>
                    <input
                      type="text"
                      value={newLinkTitle}
                      onChange={e => setNewLinkTitle(e.target.value)}
                      placeholder="Twitter, Discord, etc."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">URL</label>
                    <input
                      type="url"
                      value={newLinkUrl}
                      onChange={e => setNewLinkUrl(e.target.value)}
                      placeholder="https://twitter.com/yourhandle"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleAddLink}
                    disabled={addingLink || !newLinkTitle.trim() || !newLinkUrl.trim()}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
                  >
                    {addingLink ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Add
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Save Button */}
              <div className="mt-6 pt-4 border-t border-slate-700">
                <button
                  onClick={handleEditChannel}
                  disabled={isSavingEdit || parseFloat(balance ?? "0") < EDIT_FEE_KAS || uploadingAvatar || uploadingBanner}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Save Changes
                    </>
                  )}
                </button>
                {parseFloat(balance ?? "0") < EDIT_FEE_KAS && (
                  <p className="text-center text-sm text-red-400 mt-2">Insufficient balance</p>
                )}
              </div>
            </div>
          )}

          {/* Channel tabs */}
          <div className="flex items-center gap-8 mt-8 border-b border-slate-800 pb-4">
            <button 
              onClick={() => setActiveTab("videos")}
              className={`pb-4 border-b-2 -mb-4 transition-colors font-medium ${
                activeTab === "videos" 
                  ? "text-white border-teal-400" 
                  : "text-slate-400 hover:text-white border-transparent"
              }`}
            >
              Videos
            </button>
            <button 
              onClick={() => setActiveTab("membership")}
              className={`pb-4 border-b-2 -mb-4 transition-colors font-medium flex items-center gap-2 ${
                activeTab === "membership" 
                  ? "text-white border-teal-400" 
                  : "text-slate-400 hover:text-white border-transparent"
              }`}
            >
              <Crown className="w-4 h-4" />
              Membership
            </button>
            <button 
              onClick={() => setActiveTab("about")}
              className={`pb-4 border-b-2 -mb-4 transition-colors font-medium ${
                activeTab === "about" 
                  ? "text-white border-teal-400" 
                  : "text-slate-400 hover:text-white border-transparent"
              }`}
            >
              About
            </button>
            {isChannelOwner && (
              <>
                <button 
                  onClick={() => setActiveTab("my-videos")}
                  className={`pb-4 border-b-2 -mb-4 transition-colors font-medium flex items-center gap-2 ${
                    activeTab === "my-videos" 
                      ? "text-white border-teal-400" 
                      : "text-slate-400 hover:text-white border-transparent"
                  }`}
                >
                  <Video className="w-4 h-4" />
                  My Videos
                </button>
                <button 
                  onClick={() => setActiveTab("liked")}
                  className={`pb-4 border-b-2 -mb-4 transition-colors font-medium flex items-center gap-2 ${
                    activeTab === "liked" 
                      ? "text-white border-teal-400" 
                      : "text-slate-400 hover:text-white border-transparent"
                  }`}
                >
                  <Heart className="w-4 h-4" />
                  Liked
                </button>
              </>
            )}

          </div>

          {/* Tab content */}
          <div className="py-8">
            {/* Videos Tab */}
            {activeTab === "videos" && (
              <>
                {videosLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
                  </div>
                ) : videos.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
                    {videos.map((video) => (
                      <VideoCard 
                        key={video.id} 
                        video={{
                          ...video,
                          channel: {
                            id: channel.id,
                            name: channel.name,
                            handle: channel.handle,
                            avatarUrl: channel.avatarUrl,
                            isVerified: channel.isVerified,
                          }
                        }} 
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center border border-teal-500/30">
                      <span className="text-3xl">🎬</span>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">No videos yet</h3>
                    <p className="text-slate-400">This creator hasn't uploaded any videos yet.</p>
                  </div>
                )}
              </>
            )}

            {/* My Videos Tab - Owner only */}
            {activeTab === "my-videos" && isChannelOwner && (
              <>
                {myVideosLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
                  </div>
                ) : myVideos.length > 0 ? (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-400 mb-6">
                      Manage all your videos including private and processing ones
                    </p>
                    <div className="grid grid-cols-1 gap-4">
                      {myVideos.map((video) => (
                        <div
                          key={video.id}
                          className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-all"
                        >
                          {/* Thumbnail */}
                          <Link 
                            to={`/watch/${video.publicId || video.id}`}
                            className="relative flex-shrink-0 w-40 aspect-video rounded-lg overflow-hidden bg-slate-700"
                          >
                            {video.thumbnailUrl ? (
                              <img 
                                src={video.thumbnailUrl} 
                                alt={video.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Video className="w-8 h-8 text-slate-500" />
                              </div>
                            )}
                          </Link>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <Link 
                              to={`/watch/${video.publicId || video.id}`}
                              className="text-white font-medium hover:text-teal-400 transition-colors line-clamp-1"
                            >
                              {video.title}
                            </Link>
                            <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                              <span>{video.viewCount?.toLocaleString() || 0} views</span>
                              <span>•</span>
                              <span>{video.likeCount || 0} likes</span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              {video.isPrivate && (
                                <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-slate-700 text-slate-300 rounded-full">
                                  <EyeOff className="w-3 h-3" />
                                  Private
                                </span>
                              )}
                              {video.isMembersOnly && (
                                <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded-full">
                                  <Crown className="w-3 h-3" />
                                  Members Only
                                </span>
                              )}
                              {video.status === 'processing' && (
                                <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Processing
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/edit/${video.publicId || video.id}`}
                              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                              title="Edit video"
                            >
                              <Pencil className="w-4 h-4" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center border border-teal-500/30">
                      <Video className="w-8 h-8 text-teal-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">No videos yet</h3>
                    <p className="text-slate-400 mb-4">Upload your first video to get started.</p>
                    <Link
                      to="/upload"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 rounded-xl text-white font-semibold transition-all"
                    >
                      <Plus className="w-5 h-5" />
                      Upload Video
                    </Link>
                  </div>
                )}
              </>
            )}

            {/* Membership Tab */}
            {activeTab === "membership" && (
              <div className="max-w-4xl">
                {/* Current membership status */}
                {membership && (
                  <MembershipStatusCard 
                    membership={membership}
                    onRenew={() => {
                      // Find the user's current tier and trigger purchase flow
                      const currentTier = tiers.find(t => t.name === membership.tierName);
                      if (currentTier) {
                        handleJoinMembership(currentTier);
                      }
                    }}
                  />
                )}

                {/* Channel owner - create tier button */}
                {isChannelOwner && (
                  <div className="mb-8">
                    <button
                      onClick={() => setShowCreateTierModal(true)}
                      className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 rounded-xl text-white font-semibold transition-all"
                    >
                      <Plus className="w-5 h-5" />
                      Create Membership Tier
                    </button>
                  </div>
                )}

                {/* Membership tiers */}
                {tiersLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
                  </div>
                ) : tiers.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tiers.map((tier, index) => {
                      const isCurrentTier = membership?.tierId === tier.id;
                      const tierIcons = [Star, Crown, Sparkles];
                      const TierIcon = tierIcons[index % tierIcons.length];
                      const tierColors = [
                        { bg: "from-blue-500/20 to-indigo-500/20", border: "border-blue-500/30", icon: "text-blue-400", btn: "from-blue-500 to-indigo-500" },
                        { bg: "from-purple-500/20 to-pink-500/20", border: "border-purple-500/30", icon: "text-purple-400", btn: "from-purple-500 to-pink-500" },
                        { bg: "from-amber-500/20 to-orange-500/20", border: "border-amber-500/30", icon: "text-amber-400", btn: "from-amber-500 to-orange-500" },
                      ];
                      const colors = tierColors[index % tierColors.length];
                      
                      return (
                        <div 
                          key={tier.id}
                          className={`relative p-6 bg-gradient-to-br ${colors.bg} border ${colors.border} rounded-2xl overflow-hidden`}
                        >
                          {isCurrentTier && (
                            <div className="absolute top-3 right-3 px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full">
                              <span className="text-xs font-medium text-green-400 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Active
                              </span>
                            </div>
                          )}
                          
                          <div className="flex items-center gap-3 mb-4">
                            <div className={`p-3 rounded-xl bg-slate-900/50 ${colors.icon}`}>
                              <TierIcon className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                              <p className="text-sm text-slate-400">{tier.durationDays} days</p>
                            </div>
                          </div>
                          
                          <div className="flex items-baseline gap-1 mb-4">
                            <span className="text-3xl font-bold text-white">{parseFloat(tier.priceKas).toFixed(2)}</span>
                            <span className="text-slate-400">KAS</span>
                          </div>
                          
                          {tier.description && (
                            <p className="text-slate-300 text-sm mb-4">{tier.description}</p>
                          )}
                          
                          {tier.benefits.length > 0 && (
                            <ul className="space-y-2 mb-6">
                              {tier.benefits.map((benefit, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                  <Check className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
                                  {benefit}
                                </li>
                              ))}
                            </ul>
                          )}
                          
                          {tier.memberCount !== undefined && (
                            <p className="text-xs text-slate-500 mb-4">{tier.memberCount} members</p>
                          )}
                          
                          {!isChannelOwner && !isCurrentTier && (
                            <button
                              onClick={() => handleJoinMembership(tier)}
                              disabled={joiningTierId === tier.id}
                              className={`w-full py-3 bg-gradient-to-r ${colors.btn} hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2`}
                            >
                              {joiningTierId === tier.id ? (
                                <>
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  <Crown className="w-5 h-5" />
                                  {membership ? 'Upgrade' : 'Purchase'} — {parseFloat(tier.priceKas).toFixed(2)} KAS
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-purple-500/30">
                      <Crown className="w-8 h-8 text-purple-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">No membership tiers yet</h3>
                    <p className="text-slate-400">
                      {isChannelOwner 
                        ? "Create membership tiers to offer exclusive perks to your supporters."
                        : "This creator hasn't set up membership tiers yet."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* About Tab */}
            {activeTab === "about" && (
              <div className="max-w-2xl">
                <h3 className="text-lg font-semibold text-white mb-4">About {channel.name}</h3>
                <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {(channel as any).about || "This creator hasn't added an about section yet."}
                </p>
                <div className="mt-8 pt-8 border-t border-slate-800">
                  <h4 className="text-sm font-medium text-slate-400 mb-4">Stats</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-900/50 rounded-xl">
                      <p className="text-2xl font-bold text-white">{channel.subscriberCount.toLocaleString()}</p>
                      <p className="text-sm text-slate-400">Subscribers</p>
                    </div>
                    <div className="p-4 bg-slate-900/50 rounded-xl">
                      <p className="text-2xl font-bold text-white">{videos.length}</p>
                      <p className="text-sm text-slate-400">Videos</p>
                    </div>
                    {isChannelOwner && (
                      <div className="p-4 bg-slate-900/50 rounded-xl">
                        <p className="text-2xl font-bold text-teal-400">{formatKas(channel.totalKasEarned)}</p>
                        <p className="text-sm text-slate-400">KAS Earned</p>
                      </div>
                    )}
                    <div className="p-4 bg-slate-900/50 rounded-xl">
                      <p className="text-2xl font-bold text-white">{new Date(channel.createdAt).toLocaleDateString()}</p>
                      <p className="text-sm text-slate-400">Joined</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Liked Tab (only visible to channel owner) */}
            {activeTab === "liked" && isChannelOwner && (
              <>
                {likedVideosLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
                  </div>
                ) : likedVideos.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
                    {likedVideos.map((video) => (
                      <VideoCard 
                        key={video.id} 
                        video={video} 
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-pink-500/20 to-red-500/20 flex items-center justify-center border border-pink-500/30">
                      <Heart className="w-8 h-8 text-pink-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">No liked videos yet</h3>
                    <p className="text-slate-400">Videos you like will appear here.</p>
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </main>

      {/* Wallet Modal */}
      <WalletModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setIsWalletModalOpen(false)} 
      />

      {/* Security Verification Modal */}
      <SecurityVerificationModal
        isOpen={showSecurityModal}
        onClose={() => {
          setShowSecurityModal(false);
          setPendingTip(null);
          setPendingMembership(null);
        }}
        onVerified={pendingTip ? executeTip : executeJoinMembership}
        transactionType={pendingTip ? "tip" : "membership"}
        amount={pendingTip?.amount || (pendingMembership ? parseFloat(pendingMembership.priceKas) : undefined)}
      />

      {/* Tip Modal */}
      {showTipModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowTipModal(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Tip Creator</h2>
              <button 
                onClick={() => setShowTipModal(false)}
                className="p-2 hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6 p-4 bg-slate-800/50 rounded-xl">
              <img 
                src={channel?.avatarUrl || DEFAULT_AVATAR} 
                alt={channel?.name}
                className="w-12 h-12 rounded-full object-cover"
              />
              <div>
                <p className="font-medium text-white">{channel?.name}</p>
                <p className="text-sm text-slate-400">@{channel?.handle}</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-2 block">Tip Amount (KAS)</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <KaspaIcon size={20} />
                </div>
                <input
                  type="number"
                  value={tipAmount}
                  onChange={e => setTipAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white text-lg font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {balance !== null && (
                <p className="text-sm text-slate-500 mt-2">
                  Balance: {parseFloat(balance).toFixed(4)} KAS
                </p>
              )}
            </div>

            <div className="flex gap-2 mb-6">
              {[1, 5, 10, 25].map(amount => (
                <button
                  key={amount}
                  onClick={() => setTipAmount(amount.toString())}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium text-teal-400 transition-colors"
                >
                  {amount} KAS
                </button>
              ))}
            </div>

            <button
              onClick={handleTip}
              disabled={isTipping || !tipAmount || parseFloat(tipAmount) <= 0}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-slate-700 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {isTipping ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Gift className="w-5 h-5" />
                  Send Tip
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Create Tier Modal */}
      {showCreateTierModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowCreateTierModal(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Crown className="w-6 h-6 text-amber-400" />
                Create Membership Tier
              </h2>
              <button 
                onClick={() => setShowCreateTierModal(false)}
                className="p-2 hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Tier Name *</label>
                <input
                  type="text"
                  value={newTierName}
                  onChange={e => setNewTierName(e.target.value)}
                  placeholder="e.g. Supporter, VIP, Super Fan"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-sm text-slate-400 mb-2 block">Price (KAS) *</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <KaspaIcon size={20} />
                  </div>
                  <input
                    type="number"
                    value={newTierPrice}
                    onChange={e => setNewTierPrice(e.target.value)}
                    placeholder="10"
                    step="0.01"
                    min="0.01"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">Monthly membership price in Kaspa</p>
              </div>

              <div>
                <label className="text-sm text-slate-400 mb-2 block">Description</label>
                <input
                  type="text"
                  value={newTierDescription}
                  onChange={e => setNewTierDescription(e.target.value)}
                  placeholder="Brief description of this tier"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-sm text-slate-400 mb-2 block">Benefits (one per line)</label>
                <textarea
                  value={newTierBenefits}
                  onChange={e => setNewTierBenefits(e.target.value)}
                  placeholder={"Early access to videos\nExclusive members-only content\nShoutouts in videos\nCustom badge on comments"}
                  rows={4}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>
            </div>

            <button
              onClick={handleCreateTier}
              disabled={isCreatingTier || !newTierName.trim() || !newTierPrice}
              className="w-full mt-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 disabled:from-slate-700 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {isCreatingTier ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Create Tier
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Avatar Cropper Modal */}
      {avatarFileToProcess && (
        <ImageCropper
          isOpen={showAvatarCropper}
          onClose={() => {
            setShowAvatarCropper(false);
            setAvatarFileToProcess(null);
          }}
          imageFile={avatarFileToProcess}
          onCropComplete={handleCroppedAvatarUpload}
          aspectRatio="square"
          outputSize={{ width: 400, height: 400 }}
        />
      )}

      {/* Banner Cropper Modal */}
      {bannerFileToProcess && (
        <ImageCropper
          isOpen={showBannerCropper}
          onClose={() => {
            setShowBannerCropper(false);
            setBannerFileToProcess(null);
          }}
          imageFile={bannerFileToProcess}
          onCropComplete={handleCroppedBannerUpload}
          aspectRatio="banner"
          outputSize={{ width: 1920, height: 480 }}
        />
      )}

      {/* Channel Links Modal */}
      {showLinksModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowLinksModal(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md mx-4 p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Link2 className="w-5 h-5 text-teal-400" />
                Links
              </h3>
              <button 
                onClick={() => setShowLinksModal(false)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {channelLinks.map(link => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <ExternalLink className="w-5 h-5 text-teal-400" />
                    </div>
                    <span className="text-white font-medium truncate">{link.title}</span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-teal-400 flex-shrink-0 transition-colors" />
                </a>
              ))}
              {channelLinks.length === 0 && (
                <p className="text-center text-slate-500 py-8">No links added yet</p>
              )}
            </div>

            {/* Add link form for channel owner */}
            {isChannelOwner && (
              <div className="mt-6 pt-6 border-t border-slate-700">
                <h4 className="text-sm font-medium text-slate-400 mb-3">Add New Link</h4>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newLinkTitle}
                    onChange={e => setNewLinkTitle(e.target.value)}
                    placeholder="Link title (e.g., Twitter)"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    type="url"
                    value={newLinkUrl}
                    onChange={e => setNewLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    onClick={handleAddLink}
                    disabled={addingLink || !newLinkTitle.trim() || !newLinkUrl.trim()}
                    className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {addingLink ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Add Link
                      </>
                    )}
                  </button>
                </div>

                {/* Existing links with delete option */}
                {channelLinks.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs text-slate-500">Manage existing links:</p>
                    {channelLinks.map(link => (
                      <div key={link.id} className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
                        <span className="text-sm text-slate-300 truncate flex-1">{link.title}</span>
                        <button
                          onClick={() => handleDeleteLink(link.id)}
                          className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
