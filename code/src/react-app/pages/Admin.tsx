import { useState, useEffect } from "react";
import { ArrowLeft, Flag, Trash2, X, AlertTriangle, Video, User, Clock, Loader2, CheckCircle, Shield, Wallet, Copy, Check, DollarSign, Users, Radio, Film, AlertCircle, ExternalLink, HardDrive, RefreshCw, Gift, XCircle, Eye, Upload, Search, Music, Star, Palette, Database } from "lucide-react";
import LocalizedLink from "../components/LocalizedLink";
import { useElectronTitleBar } from "../components/ElectronTitleBar";
import { useLocalizedNavigate } from "../components/LanguageRouter";
import { useWallet } from "../contexts/WalletContext";
import toast from "react-hot-toast";

interface Report {
  id: number;
  videoId: number;
  reason: string;
  status: "pending" | "reviewed" | "dismissed" | "resolved";
  actionTaken: string | null;
  createdAt: string;
  reviewedAt: string | null;
  video: {
    id: number;
    title: string;
    thumbnailUrl: string | null;
    videoUrl: string | null;
    channel: {
      name: string;
      handle: string;
    };
  };
  reporter: {
    name: string;
    handle: string;
  } | null;
}

interface AdminStatus {
  isAdmin: boolean;
  totalReports: number;
  pendingReports: number;
}

interface PendingPayout {
  channelId: number;
  handle: string;
  name: string;
  walletAddress: string;
  pendingBalanceSompi: string;
  pendingBalanceKas: number;
  readyForPayout: boolean;
  micropaymentCount: number;
}

interface PayoutSummary {
  totalCreators: number;
  readyForPayout: number;
  totalPendingKas: number;
  readyPayoutKas: number;
}

interface AdminChannel {
  id: number;
  handle: string;
  name: string;
  description: string | null;
  walletAddress: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  isVerified: boolean;
  subscriberCount: number;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  hasActiveOwner: boolean;
}

interface AdminVideo {
  id: number;
  publicId: string | null;
  title: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  isPrivate: boolean;
  isMembersOnly: boolean;
  createdAt: string;
  channel: {
    id: number;
    name: string;
    handle: string;
  };
  fileStatus: {
    videoExists: boolean;
    thumbnailExists: boolean;
    isBroken: boolean;
  };
}

interface R2DebugData {
  r2Objects: { key: string; size: number; uploaded: string }[];
  r2Count: number;
  truncated: boolean;
  databaseVideos: { id: number; title: string; video_url: string | null; thumbnail_url: string | null }[];
  databaseChannels: { id: number; name: string; handle: string; avatar_url: string | null; banner_url: string | null }[];
}

interface AdminReferral {
  id: number;
  referralCode: string;
  status: "active" | "completed" | "pending_approval" | "approved" | "rejected" | "paid";
  videosUploadedCount: number;
  uniqueVideosWatched: number;
  uniqueChannelsWatched: number;
  requirementsMetAt: string | null;
  paidAt: string | null;
  createdAt: string;
  referrer: {
    id: number;
    name: string;
    handle: string;
    avatarUrl: string | null;
  };
  referred: {
    id: number;
    name: string;
    handle: string;
    avatarUrl: string | null;
    walletAddress: string;
    createdAt: string;
  };
}

interface ReferralSummary {
  totalReferrals: number;
  pendingApproval: number;
  approved: number;
  paid: number;
  active: number;
}

interface AdminUser {
  userType: 'external' | 'google';
  id: string | number;
  externalWallet?: string;
  internalWallet?: string;
  wallet?: string;
  demoBalance: string | null;
  createdAt: string;
  channelHandle: string | null;
  channelName: string | null;
}

interface MusicReport {
  id: number;
  profileId: number;
  reporterWalletAddress: string;
  reason: string;
  details: string | null;
  status: 'pending' | 'reviewed' | 'dismissed';
  reviewedAt: string | null;
  actionTaken: string | null;
  createdAt: string;
  profile: {
    id: number;
    name: string;
    walletAddress: string;
    avatarUrl: string | null;
  };
}

interface UserDetails {
  userType: 'external' | 'google';
  id: string | number;
  externalWallet?: string;
  internalWallet?: string;
  wallet?: string;
  demoBalance: string | null;
  externalBalanceKas?: string;
  internalBalanceKas?: string;
  balanceKas?: string;
  createdAt: string;
  channel: { id: number; handle: string; name: string } | null;
}

interface FailedReviewPayment {
  id: number;
  trackId: number;
  reviewerWallet: string;
  rating: number;
  comment: string | null;
  paymentStatus: string;
  retryCount: number | null;
  rewardKas: string;
  trackTitle: string;
  trackArtist: string;
  createdAt: string;
}

export default function Admin() {
  const navigate = useLocalizedNavigate();
  const { titleBarPadding } = useElectronTitleBar();
  const { externalWallet } = useWallet();
  const [loading, setLoading] = useState(true);
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "reviewed" | "dismissed">("pending");
  const [activeTab, setActiveTab] = useState<"reports" | "payouts" | "channels" | "videos" | "referrals" | "users" | "musicReports" | "reviewPayments" | "themeApprovals" | "musicProfiles">("reports");
  const [payouts, setPayouts] = useState<PendingPayout[]>([]);
  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState<number | null>(null);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [reassignModal, setReassignModal] = useState<AdminChannel | null>(null);
  const [adminVideos, setAdminVideos] = useState<AdminVideo[]>([]);
  const [brokenVideoCount, setBrokenVideoCount] = useState(0);
  const [deletingVideoId, setDeletingVideoId] = useState<number | null>(null);
  const [videoFilter, setVideoFilter] = useState<"all" | "broken">("broken");
  const [newWalletAddress, setNewWalletAddress] = useState("");
  const [isReassigning, setIsReassigning] = useState(false);
  const [r2DebugData, setR2DebugData] = useState<R2DebugData | null>(null);
  const [loadingR2Debug, setLoadingR2Debug] = useState(false);
  const [referrals, setReferrals] = useState<AdminReferral[]>([]);
  const [referralSummary, setReferralSummary] = useState<ReferralSummary | null>(null);
  const [referralFilter, setReferralFilter] = useState<"all" | "pending_approval" | "approved" | "paid">("pending_approval");
  const [processingReferralId, setProcessingReferralId] = useState<number | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<AdminUser[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [loadingUserDetails, setLoadingUserDetails] = useState(false);
  const [musicReports, setMusicReports] = useState<MusicReport[]>([]);
  const [musicReportFilter, setMusicReportFilter] = useState<"all" | "pending" | "reviewed" | "dismissed">("pending");
  const [processingMusicReportId, setProcessingMusicReportId] = useState<number | null>(null);
  const [failedReviewPayments, setFailedReviewPayments] = useState<FailedReviewPayment[]>([]);
  const [processingPaymentId, setProcessingPaymentId] = useState<number | null>(null);
  const [processingAllPayments, setProcessingAllPayments] = useState(false);
  const [platformWalletStatus, setPlatformWalletStatus] = useState<{
    configured: boolean;
    hasPrivateKey: boolean;
    walletAddress: string | null;
    balance: string;
    canPayRewards: boolean;
    message: string;
  } | null>(null);
  const [pendingThemes, setPendingThemes] = useState<{
    id: number;
    title: string;
    description: string;
    previewImageUrl: string;
    priceKas: string;
    quantityTotal: number | null;
    hasParticles: boolean;
    particleColor: string | null;
    creatorName: string;
    creatorWalletAddress: string;
    createdAt: string;
  }[]>([]);
  const [processingThemeId, setProcessingThemeId] = useState<number | null>(null);
  const [rejectingThemeId, setRejectingThemeId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [musicProfileSearch, setMusicProfileSearch] = useState("");
  const [musicProfileResults, setMusicProfileResults] = useState<{
    id: number;
    name: string;
    handle: string | null;
    wallet_address: string;
    user_id: string | null;
    avatar_url: string | null;
    created_at: string;
  }[]>([]);
  const [isSearchingProfiles, setIsSearchingProfiles] = useState(false);
  const [updatingProfileId, setUpdatingProfileId] = useState<number | null>(null);
  const [profileUpdateData, setProfileUpdateData] = useState<{ walletAddress: string; userId: string }>({ walletAddress: "", userId: "" });
  const [currentUserInfo, setCurrentUserInfo] = useState<{ userId: string; walletAddress: string } | null>(null);


  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        // Check admin status
        const statusRes = await fetch("/api/admin/status", { credentials: "include" });
        if (!statusRes.ok) {
          if (statusRes.status === 403) {
            toast.error("Access denied - Admin only");
            navigate("/settings");
            return;
          }
          throw new Error("Failed to fetch admin status");
        }
        const status = await statusRes.json();
        setAdminStatus(status);

        // Fetch reports
        const reportsRes = await fetch("/api/admin/reports", { credentials: "include" });
        if (reportsRes.ok) {
          const data = await reportsRes.json();
          setReports(data.reports || []);
        }

        // Fetch payouts
        const payoutsRes = await fetch("/api/admin/payouts", { credentials: "include" });
        if (payoutsRes.ok) {
          const data = await payoutsRes.json();
          setPayouts(data.payouts || []);
          setPayoutSummary(data.summary || null);
        }

        // Fetch channels
        const channelsRes = await fetch("/api/admin/channels", { credentials: "include" });
        if (channelsRes.ok) {
          const data = await channelsRes.json();
          setChannels(data.channels || []);
        }

        // Fetch videos
        const videosRes = await fetch("/api/admin/videos", { credentials: "include" });
        if (videosRes.ok) {
          const data = await videosRes.json();
          setAdminVideos(data.videos || []);
          setBrokenVideoCount(data.brokenCount || 0);
        }

        // Fetch referrals
        const referralsRes = await fetch("/api/admin/referrals", { credentials: "include" });
        if (referralsRes.ok) {
          const data = await referralsRes.json();
          setReferrals(data.referrals || []);
          setReferralSummary(data.summary || null);
        }

        // Fetch music reports
        const musicReportsRes = await fetch("/api/admin/music-reports", { credentials: "include" });
        if (musicReportsRes.ok) {
          const data = await musicReportsRes.json();
          setMusicReports(data.reports || []);
        }

        // Fetch failed review payments
        const failedPaymentsRes = await fetch("/api/music/admin/failed-review-payments", { 
          credentials: "include",
          headers: externalWallet?.authToken ? { "Authorization": `Bearer ${externalWallet.authToken}` } : {}
        });
        if (failedPaymentsRes.ok) {
          const data = await failedPaymentsRes.json();
          setFailedReviewPayments(data.failedPayments || []);
        }

        // Fetch platform wallet status for review payments
        const walletStatusRes = await fetch("/api/music/admin/platform-wallet-status", {
          credentials: "include",
          headers: externalWallet?.authToken ? { "Authorization": `Bearer ${externalWallet.authToken}` } : {}
        });
        if (walletStatusRes.ok) {
          const data = await walletStatusRes.json();
          setPlatformWalletStatus(data);
        }

        // Fetch pending marketplace themes
        const pendingThemesRes = await fetch("/api/marketplace/admin/pending", {
          credentials: "include",
          headers: externalWallet?.authToken ? { "Authorization": `Bearer ${externalWallet.authToken}` } : {}
        });
        if (pendingThemesRes.ok) {
          const data = await pendingThemesRes.json();
          setPendingThemes(data.themes || []);
        }
      } catch (err) {
        console.error("Admin fetch error:", err);
        toast.error("Failed to load admin data");
      } finally {
        setLoading(false);
      }
    };
    fetchAdminData();
  }, [navigate]);

  const handleDeleteVideo = async (report: Report) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete this video?\n\n` +
      `Title: "${report.video?.title || 'Unknown'}"\n\n` +
      `This action cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/videos/${report.videoId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Video deleted successfully");
      // Update report status in list
      setReports(prev => prev.map(r => 
        r.videoId === report.videoId 
          ? { ...r, status: "reviewed", actionTaken: "deleted", reviewedAt: new Date().toISOString() }
          : r
      ));
      setSelectedReport(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete video");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDismissReport = async (report: Report) => {
    setIsDismissing(true);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}/dismiss`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Report dismissed");
      // Update report in list
      setReports(prev => prev.map(r => 
        r.id === report.id 
          ? { ...r, status: "dismissed", reviewedAt: new Date().toISOString() }
          : r
      ));
      setSelectedReport(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dismiss report");
    } finally {
      setIsDismissing(false);
    }
  };

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    toast.success("Wallet address copied");
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleDeleteAdminVideo = async (video: AdminVideo) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete this video?\n\n` +
      `Title: "${video.title}"\n` +
      `Channel: @${video.channel.handle}\n` +
      `Status: ${video.fileStatus.isBroken ? "BROKEN (files missing)" : "OK"}\n\n` +
      `This action cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingVideoId(video.id);
    try {
      const res = await fetch(`/api/admin/videos/${video.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Video deleted successfully");
      setAdminVideos(prev => prev.filter(v => v.id !== video.id));
      if (video.fileStatus.isBroken) {
        setBrokenVideoCount(prev => prev - 1);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete video");
    } finally {
      setDeletingVideoId(null);
    }
  };

  const handleReassignChannel = async () => {
    if (!reassignModal || !newWalletAddress.trim()) return;
    
    if (!newWalletAddress.startsWith("kaspa:")) {
      toast.error("Invalid Kaspa wallet address");
      return;
    }

    setIsReassigning(true);
    try {
      const res = await fetch(`/api/admin/channels/${reassignModal.id}/reassign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newWalletAddress: newWalletAddress.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(`Channel @${reassignModal.handle} reassigned to new wallet`);
      // Update channel in list
      setChannels(prev => prev.map(ch => 
        ch.id === reassignModal.id 
          ? { ...ch, walletAddress: newWalletAddress.trim(), hasActiveOwner: data.channel.hasActiveOwner }
          : ch
      ));
      setReassignModal(null);
      setNewWalletAddress("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reassign channel");
    } finally {
      setIsReassigning(false);
    }
  };

  const handleMarkAsPaid = async (payout: PendingPayout) => {
    const confirmed = window.confirm(
      `Mark payout as complete?\n\n` +
      `Channel: @${payout.handle}\n` +
      `Amount: ${payout.pendingBalanceKas.toFixed(4)} KAS\n` +
      `Wallet: ${payout.walletAddress.slice(0, 20)}...${payout.walletAddress.slice(-10)}\n\n` +
      `This will clear their pending balance. Make sure you've already sent the payment on-chain.`
    );
    if (!confirmed) return;

    setMarkingPaid(payout.channelId);
    try {
      const res = await fetch(`/api/admin/payouts/${payout.channelId}/mark-paid`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(`Marked @${payout.handle} as paid`);
      // Remove from list
      setPayouts(prev => prev.filter(p => p.channelId !== payout.channelId));
      // Update summary
      if (payoutSummary) {
        setPayoutSummary({
          ...payoutSummary,
          totalCreators: payoutSummary.totalCreators - 1,
          totalPendingKas: payoutSummary.totalPendingKas - payout.pendingBalanceKas,
          readyForPayout: payout.readyForPayout ? payoutSummary.readyForPayout - 1 : payoutSummary.readyForPayout,
          readyPayoutKas: payout.readyForPayout ? payoutSummary.readyPayoutKas - payout.pendingBalanceKas : payoutSummary.readyPayoutKas
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark as paid");
    } finally {
      setMarkingPaid(null);
    }
  };

  const handleReferralAction = async (referral: AdminReferral, action: "approve" | "reject") => {
    const actionText = action === "approve" ? "approve" : "reject";
    const confirmed = window.confirm(
      `Are you sure you want to ${actionText} this referral?\n\n` +
      `Referrer: @${referral.referrer.handle}\n` +
      `Referred: @${referral.referred.handle}\n\n` +
      (action === "approve" 
        ? `This will credit 100 KAS to the referrer and 50 KAS to the referred user.`
        : `This referral will be marked as rejected and no payouts will be made.`)
    );
    if (!confirmed) return;

    setProcessingReferralId(referral.id);
    try {
      const res = await fetch(`/api/admin/referrals/${referral.id}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(action === "approve" 
        ? `Referral approved! Credited 100 KAS to referrer, 50 KAS to referred user.`
        : `Referral rejected.`
      );
      
      // Update referral in list
      setReferrals(prev => prev.map(r => 
        r.id === referral.id 
          ? { ...r, status: action === "approve" ? "paid" : "rejected", paidAt: action === "approve" ? new Date().toISOString() : null }
          : r
      ));
      
      // Update summary
      if (referralSummary) {
        setReferralSummary({
          ...referralSummary,
          pendingApproval: Math.max(0, referralSummary.pendingApproval - 1),
          ...(action === "approve" ? { paid: referralSummary.paid + 1 } : {}),
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${actionText} referral`);
    } finally {
      setProcessingReferralId(null);
    }
  };

  const filteredReferrals = referrals.filter(r => {
    if (referralFilter === "all") return true;
    return r.status === referralFilter;
  });

  const handleRetryPayment = async (reviewId: number) => {
    setProcessingPaymentId(reviewId);
    try {
      const res = await fetch(`/api/music/admin/retry-review-payment/${reviewId}`, {
        method: "POST",
        credentials: "include",
        headers: externalWallet?.authToken ? { "Authorization": `Bearer ${externalWallet.authToken}` } : {}
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to retry payment");

      toast.success(`Payment sent! ${data.rewardKas} KAS to reviewer. TX: ${data.transactionId?.slice(0, 12)}...`);
      
      // Remove from failed list
      setFailedReviewPayments(prev => prev.filter(p => p.id !== reviewId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to retry payment");
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleProcessAllPayments = async () => {
    if (failedReviewPayments.length === 0) {
      toast.error("No failed payments to process");
      return;
    }
    
    const confirmed = window.confirm(
      `Process all ${failedReviewPayments.length} failed payments?\n\n` +
      `This will retry each payment with a 3-second delay between transactions.`
    );
    if (!confirmed) return;

    setProcessingAllPayments(true);
    try {
      const res = await fetch("/api/music/admin/process-payment-queue", {
        method: "POST",
        credentials: "include",
        headers: externalWallet?.authToken ? { "Authorization": `Bearer ${externalWallet.authToken}` } : {}
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process payments");

      toast.success(`Processed ${data.processed} payments, ${data.failed} failed`);
      
      // Refresh the list
      const refreshRes = await fetch("/api/music/admin/failed-review-payments", { 
        credentials: "include",
        headers: externalWallet?.authToken ? { "Authorization": `Bearer ${externalWallet.authToken}` } : {}
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setFailedReviewPayments(refreshData.failedPayments || []);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process payments");
    } finally {
      setProcessingAllPayments(false);
    }
  };

  const handleApproveTheme = async (themeId: number) => {
    setProcessingThemeId(themeId);
    try {
      const res = await fetch(`/api/marketplace/admin/themes/${themeId}/approve`, {
        method: "POST",
        credentials: "include",
        headers: externalWallet?.authToken ? { "Authorization": `Bearer ${externalWallet.authToken}` } : {}
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to approve theme");
      
      toast.success("Theme approved successfully");
      setPendingThemes(prev => prev.filter(t => t.id !== themeId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve theme");
    } finally {
      setProcessingThemeId(null);
    }
  };

  const handleRejectTheme = async (themeId: number) => {
    if (!rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    
    setProcessingThemeId(themeId);
    try {
      const res = await fetch(`/api/marketplace/admin/themes/${themeId}/reject`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(externalWallet?.authToken ? { "Authorization": `Bearer ${externalWallet.authToken}` } : {})
        },
        body: JSON.stringify({ reason: rejectReason.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject theme");
      
      toast.success("Theme rejected");
      setPendingThemes(prev => prev.filter(t => t.id !== themeId));
      setRejectingThemeId(null);
      setRejectReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject theme");
    } finally {
      setProcessingThemeId(null);
    }
  };

  const fetchR2Debug = async () => {
    setLoadingR2Debug(true);
    try {
      const res = await fetch("/api/admin/r2-debug", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch R2 debug data");
      const data = await res.json();
      setR2DebugData(data);
      toast.success(`Found ${data.r2Count} files in R2 storage`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch R2 debug data");
    } finally {
      setLoadingR2Debug(false);
    }
  };

  const searchUsers = async () => {
    if (userSearchQuery.length < 6) {
      toast.error("Enter at least 6 characters to search");
      return;
    }

    setIsSearchingUsers(true);
    try {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(userSearchQuery)}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUserSearchResults(data.users);
      if (data.users.length === 0) {
        toast("No users found matching that address");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const viewUserDetails = async (user: AdminUser) => {
    setLoadingUserDetails(true);
    try {
      const res = await fetch(`/api/admin/users/${user.userType}/${user.id}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedUser(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load user details");
    } finally {
      setLoadingUserDetails(false);
    }
  };

  const filteredReports = reports.filter(r => {
    if (filter === "all") return true;
    if (filter === "reviewed") return r.status === "reviewed" || r.status === "resolved";
    return r.status === filter;
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      spam: "Spam or misleading",
      harassment: "Harassment or bullying",
      hate: "Hate speech",
      violence: "Violence or dangerous content",
      sexual: "Sexual content",
      copyright: "Copyright violation",
      other: "Other",
    };
    return labels[reason] || reason;
  };

  if (loading) {
    return (
      <div className={`min-h-screen w-full bg-[#0a0f14] flex items-center justify-center ${titleBarPadding}`}>
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (!adminStatus?.isAdmin) {
    return (
      <div className={`min-h-screen w-full bg-[#0a0f14] flex flex-col items-center justify-center gap-4 ${titleBarPadding}`}>
        <Shield className="w-16 h-16 text-red-500/50" />
        <h1 className="text-xl font-semibold text-white">Access Denied</h1>
        <p className="text-white/60">You don't have permission to access this page.</p>
        <LocalizedLink to="/video" className="text-teal-400 hover:underline">Return to Home</LocalizedLink>
      </div>
    );
  }

  return (
    <div className={`min-h-screen w-full bg-[#0a0f14] flex flex-col ${titleBarPadding}`}>
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0a0f14]/95 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <LocalizedLink 
              to="/settings" 
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </LocalizedLink>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-teal-400" />
                Admin Dashboard
              </h1>
              <p className="text-white/60 text-sm">Manage reports and moderate content</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Main Tabs */}
        <div className="flex gap-2 mb-6 border-b border-white/10 pb-4">
          <button
            onClick={() => setActiveTab("reports")}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === "reports"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <Flag className="w-4 h-4" />
            Reports
            {adminStatus && adminStatus.pendingReports > 0 && (
              <span className="px-1.5 py-0.5 bg-yellow-500 text-black text-xs rounded-full">
                {adminStatus.pendingReports}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("payouts")}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === "payouts"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <Wallet className="w-4 h-4" />
            Creator Payouts
            {payoutSummary && payoutSummary.readyForPayout > 0 && (
              <span className="px-1.5 py-0.5 bg-teal-500 text-white text-xs rounded-full">
                {payoutSummary.readyForPayout}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("channels")}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === "channels"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <Radio className="w-4 h-4" />
            Channels
            {channels.filter(c => !c.hasActiveOwner).length > 0 && (
              <span className="px-1.5 py-0.5 bg-yellow-500 text-black text-xs rounded-full">
                {channels.filter(c => !c.hasActiveOwner).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("videos")}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === "videos"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <Film className="w-4 h-4" />
            Videos
            {brokenVideoCount > 0 && (
              <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {brokenVideoCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("referrals")}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === "referrals"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <Gift className="w-4 h-4" />
            Referrals
            {referralSummary && referralSummary.pendingApproval > 0 && (
              <span className="px-1.5 py-0.5 bg-yellow-500 text-black text-xs rounded-full">
                {referralSummary.pendingApproval}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === "users"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <Search className="w-4 h-4" />
            User Lookup
          </button>
          <button
            onClick={() => setActiveTab("musicReports")}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === "musicReports"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <Music className="w-4 h-4" />
            Music Reports
            {musicReports.filter(r => r.status === "pending").length > 0 && (
              <span className="px-1.5 py-0.5 bg-yellow-500 text-black text-xs rounded-full">
                {musicReports.filter(r => r.status === "pending").length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("reviewPayments")}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === "reviewPayments"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <Star className="w-4 h-4" />
            Review Payments
            {failedReviewPayments.length > 0 && (
              <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {failedReviewPayments.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("themeApprovals")}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === "themeApprovals"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <Palette className="w-4 h-4" />
            Theme Approvals
            {pendingThemes.length > 0 && (
              <span className="px-1.5 py-0.5 bg-yellow-500 text-black text-xs rounded-full">
                {pendingThemes.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("musicProfiles")}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === "musicProfiles"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <User className="w-4 h-4" />
            Music Profiles
          </button>
          <a
            href="/music/admin/reanalyze"
            className="px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30"
          >
            <RefreshCw className="w-4 h-4" />
            Beat Analysis
          </a>
          <LocalizedLink
            to="/admin/export"
            className="px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
          >
            <Database className="w-4 h-4" />
            Export Data
          </LocalizedLink>
        </div>

        {activeTab === "reports" && (
          <>
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-2xl font-bold text-white">{adminStatus?.totalReports || 0}</div>
            <div className="text-white/50 text-sm">Total Reports</div>
          </div>
          <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
            <div className="text-2xl font-bold text-yellow-400">{adminStatus?.pendingReports || 0}</div>
            <div className="text-yellow-400/70 text-sm">Pending</div>
          </div>
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
            <div className="text-2xl font-bold text-green-400">
              {reports.filter(r => r.status === "reviewed").length}
            </div>
            <div className="text-green-400/70 text-sm">Reviewed</div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-2xl font-bold text-white/60">
              {reports.filter(r => r.status === "dismissed").length}
            </div>
            <div className="text-white/40 text-sm">Dismissed</div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {(["pending", "all", "reviewed", "dismissed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                filter === f
                  ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                  : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === "pending" && adminStatus && adminStatus.pendingReports > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-yellow-500 text-black text-xs rounded-full">
                  {adminStatus.pendingReports}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Reports List */}
        <div className="space-y-3">
          {filteredReports.length === 0 ? (
            <div className="text-center py-12 text-white/50">
              <Flag className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No {filter === "all" ? "" : filter} reports found</p>
            </div>
          ) : (
            filteredReports.map((report) => (
              <div
                key={report.id}
                onClick={() => setSelectedReport(report)}
                className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                  report.status === "pending"
                    ? "bg-yellow-500/5 border-yellow-500/20 hover:border-yellow-500/40"
                    : report.status === "reviewed"
                    ? "bg-green-500/5 border-green-500/20 hover:border-green-500/40"
                    : "bg-white/5 border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  <div className="w-24 h-14 md:w-32 md:h-18 rounded-lg bg-white/10 overflow-hidden flex-shrink-0">
                    {report.video?.thumbnailUrl ? (
                      <img 
                        src={report.video.thumbnailUrl} 
                        alt={report.video?.title || 'Video'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="w-6 h-6 text-white/30" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium text-white truncate">{report.video?.title || 'Deleted Video'}</h3>
                        <p className="text-sm text-white/50 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          Reported by @{report.reporter?.handle || 'Unknown'}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${
                        report.status === "pending"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : report.status === "reviewed"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-slate-500/20 text-slate-400"
                      }`}>
                        {report.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-white/40">
                      <span className="flex items-center gap-1">
                        <Flag className="w-3 h-3" />
                        {getReasonLabel(report.reason)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(report.createdAt)}
                      </span>
                    </div>
                    {report.actionTaken && (
                      <div className="mt-2 text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Action: {report.actionTaken}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
          </>
        )}

        {activeTab === "payouts" && (
          <>
            {/* Payout Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-2xl font-bold text-white">{payoutSummary?.totalCreators || 0}</div>
                <div className="text-white/50 text-sm flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  Creators with Balance
                </div>
              </div>
              <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/30">
                <div className="text-2xl font-bold text-teal-400">{payoutSummary?.readyForPayout || 0}</div>
                <div className="text-teal-400/70 text-sm">Ready for Payout</div>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-2xl font-bold text-white">{payoutSummary?.totalPendingKas.toFixed(2) || "0.00"}</div>
                <div className="text-white/50 text-sm">Total Pending KAS</div>
              </div>
              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                <div className="text-2xl font-bold text-green-400">{payoutSummary?.readyPayoutKas.toFixed(2) || "0.00"}</div>
                <div className="text-green-400/70 text-sm">Ready to Pay KAS</div>
              </div>
            </div>

            {/* Info Banner */}
            <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20 mb-6">
              <p className="text-teal-400 text-sm flex items-start gap-2">
                <Wallet className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Manual Payout Process:</strong> Copy the creator's wallet address, send KAS manually via Kaspa Wallet, 
                  then click "Mark as Paid" to clear their pending balance. Payouts become ready at 0.11 KAS threshold.
                </span>
              </p>
            </div>

            {/* Payouts List */}
            <div className="space-y-3">
              {payouts.length === 0 ? (
                <div className="text-center py-12 text-white/50">
                  <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No pending creator payouts</p>
                </div>
              ) : (
                payouts.map((payout) => (
                  <div
                    key={payout.channelId}
                    className={`p-4 rounded-xl border transition-colors ${
                      payout.readyForPayout
                        ? "bg-teal-500/5 border-teal-500/20"
                        : "bg-white/5 border-white/10"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      {/* Channel Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-white truncate">{payout.name}</h3>
                          {payout.readyForPayout && (
                            <span className="px-2 py-0.5 bg-teal-500/20 text-teal-400 text-xs rounded-full">
                              Ready
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-white/50">@{payout.handle}</p>
                        
                        {/* Wallet Address */}
                        <div className="mt-2 flex items-center gap-2">
                          <code className="text-xs text-white/40 bg-white/5 px-2 py-1 rounded font-mono truncate max-w-[300px]">
                            {payout.walletAddress}
                          </code>
                          <button
                            onClick={() => handleCopyAddress(payout.walletAddress)}
                            className="p-1.5 rounded hover:bg-white/10 transition-colors"
                            title="Copy wallet address"
                          >
                            {copiedAddress === payout.walletAddress ? (
                              <Check className="w-4 h-4 text-green-400" />
                            ) : (
                              <Copy className="w-4 h-4 text-white/50" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Amount & Actions */}
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className={`text-xl font-bold ${payout.readyForPayout ? "text-teal-400" : "text-white"}`}>
                            {payout.pendingBalanceKas.toFixed(4)} KAS
                          </div>
                          <div className="text-xs text-white/40">
                            {payout.micropaymentCount} micropayments
                          </div>
                        </div>
                        <button
                          onClick={() => handleMarkAsPaid(payout)}
                          disabled={markingPaid === payout.channelId}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                            payout.readyForPayout
                              ? "bg-teal-500 hover:bg-teal-400 text-white"
                              : "bg-white/10 hover:bg-white/20 text-white/70"
                          } disabled:opacity-50`}
                        >
                          {markingPaid === payout.channelId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <DollarSign className="w-4 h-4" />
                              Mark as Paid
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Channels Tab */}
        {activeTab === "channels" && (
          <>
            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 mb-6">
              <p className="text-yellow-400 text-sm">
                <strong>Orphaned Channels:</strong> Channels where no user wallet matches the channel's wallet address. 
                Use reassign to transfer ownership to a different wallet.
              </p>
            </div>

            <div className="space-y-3">
              {channels.length === 0 ? (
                <div className="text-center py-12 text-white/50">
                  <Radio className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No channels found</p>
                </div>
              ) : (
                channels.map((channel) => (
                  <div
                    key={channel.id}
                    className={`p-4 rounded-xl border ${
                      !channel.hasActiveOwner
                        ? "bg-yellow-500/5 border-yellow-500/20"
                        : "bg-white/5 border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {channel.avatarUrl ? (
                        <img src={channel.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-white/50" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{channel.name}</span>
                          {!channel.hasActiveOwner && (
                            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">Orphaned</span>
                          )}
                        </div>
                        <div className="text-sm text-white/50">@{channel.handle}</div>
                      </div>
                      <button
                        onClick={() => {
                          setReassignModal(channel);
                          setNewWalletAddress(channel.walletAddress);
                        }}
                        className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg"
                      >
                        Reassign
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-white/40 font-mono truncate">
                      {channel.walletAddress}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === "videos" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-2xl font-bold text-white">{adminVideos.length}</div>
                <div className="text-white/50 text-sm">Total Videos</div>
              </div>
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                <div className="text-2xl font-bold text-red-400">{brokenVideoCount}</div>
                <div className="text-red-400/70 text-sm">Broken</div>
              </div>
              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                <div className="text-2xl font-bold text-green-400">
                  {adminVideos.filter(v => !v.fileStatus.isBroken).length}
                </div>
                <div className="text-green-400/70 text-sm">Working</div>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-2xl font-bold text-white/60">
                  {adminVideos.filter(v => v.isPrivate || v.isMembersOnly).length}
                </div>
                <div className="text-white/50 text-sm">Private/Members</div>
              </div>
            </div>

            {/* Filter */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setVideoFilter("broken")}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  videoFilter === "broken"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
                }`}
              >
                Broken Only ({brokenVideoCount})
              </button>
              <button
                onClick={() => setVideoFilter("all")}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  videoFilter === "all"
                    ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                    : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
                }`}
              >
                All Videos
              </button>
            </div>

            {/* Videos List */}
            <div className="space-y-3">
              {adminVideos
                .filter(v => videoFilter === "all" || v.fileStatus.isBroken)
                .map(video => (
                  <div
                    key={video.id}
                    className={`p-4 rounded-xl border ${
                      video.fileStatus.isBroken
                        ? "bg-red-500/5 border-red-500/20"
                        : "bg-white/5 border-white/10"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Thumbnail */}
                      <div className="w-24 h-14 flex-shrink-0 rounded-lg bg-white/10 overflow-hidden">
                        {video.thumbnailUrl && video.fileStatus.thumbnailExists ? (
                          <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-6 h-6 text-white/30" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white truncate">{video.title}</span>
                          {video.fileStatus.isBroken && (
                            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Broken
                            </span>
                          )}
                          {video.isPrivate && (
                            <span className="px-2 py-0.5 bg-white/10 text-white/60 text-xs rounded-full">Private</span>
                          )}
                          {video.isMembersOnly && (
                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">Members</span>
                          )}
                        </div>
                        <div className="text-sm text-white/50 mt-1">
                          @{video.channel.handle} • ID: {video.id} {video.publicId && `• ${video.publicId}`}
                        </div>
                        <div className="text-xs text-white/40 mt-1 flex items-center gap-3">
                          <span>{formatDate(video.createdAt)}</span>
                          <span>{video.durationSeconds ? `${Math.floor(video.durationSeconds / 60)}:${String(video.durationSeconds % 60).padStart(2, '0')}` : "0:00"}</span>
                          {video.fileStatus.isBroken && (
                            <span className="text-red-400">
                              {!video.fileStatus.videoExists && "Video file missing"}
                              {!video.fileStatus.videoExists && !video.fileStatus.thumbnailExists && " • "}
                              {!video.fileStatus.thumbnailExists && "Thumbnail missing"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {video.publicId && !video.fileStatus.isBroken && (
                          <LocalizedLink
                            to={`/video/watch/${video.publicId}`}
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </LocalizedLink>
                        )}
                        <button
                          onClick={() => handleDeleteAdminVideo(video)}
                          disabled={deletingVideoId === video.id}
                          className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                            video.fileStatus.isBroken
                              ? "bg-red-500/20 hover:bg-red-500/30 text-red-400"
                              : "bg-white/10 hover:bg-red-500/20 text-white/60 hover:text-red-400"
                          }`}
                        >
                          {deletingVideoId === video.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

              {adminVideos.filter(v => videoFilter === "all" || v.fileStatus.isBroken).length === 0 && (
                <div className="text-center py-12 text-white/40">
                  {videoFilter === "broken" ? (
                    <>
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400/50" />
                      <p>No broken videos found</p>
                    </>
                  ) : (
                    <>
                      <Film className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No videos in the system</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* R2 Debug Section */}
            <div className="mt-8 p-6 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <HardDrive className="w-5 h-5" />
                  R2 Storage Debug
                </h3>
                <button
                  onClick={fetchR2Debug}
                  disabled={loadingR2Debug}
                  className="px-4 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {loadingR2Debug ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {loadingR2Debug ? "Scanning..." : "Scan R2 Storage"}
                </button>
              </div>

              {r2DebugData && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 rounded-lg bg-white/5">
                      <div className="text-xl font-bold text-white">{r2DebugData.r2Count}</div>
                      <div className="text-white/50 text-xs">R2 Objects</div>
                    </div>
                    <div className="p-3 rounded-lg bg-white/5">
                      <div className="text-xl font-bold text-white">{r2DebugData.databaseVideos.length}</div>
                      <div className="text-white/50 text-xs">DB Videos</div>
                    </div>
                    <div className="p-3 rounded-lg bg-white/5">
                      <div className="text-xl font-bold text-white">{r2DebugData.databaseChannels.length}</div>
                      <div className="text-white/50 text-xs">DB Channels</div>
                    </div>
                    <div className="p-3 rounded-lg bg-white/5">
                      <div className="text-xl font-bold text-white">
                        {(r2DebugData.r2Objects.reduce((acc, obj) => acc + obj.size, 0) / (1024 * 1024 * 1024)).toFixed(2)} GB
                      </div>
                      <div className="text-white/50 text-xs">Total Size</div>
                    </div>
                  </div>

                  {/* R2 Objects List */}
                  <div>
                    <h4 className="text-sm font-medium text-white/70 mb-2">R2 Objects ({r2DebugData.r2Objects.length})</h4>
                    <div className="max-h-60 overflow-y-auto space-y-1 bg-black/30 rounded-lg p-2">
                      {r2DebugData.r2Objects.length === 0 ? (
                        <p className="text-white/40 text-sm text-center py-4">No files in R2 storage</p>
                      ) : (
                        r2DebugData.r2Objects.map((obj, i) => {
                          // Check if this R2 file has a matching DB record
                          const isVideo = obj.key.startsWith('videos/');
                          const isThumbnail = obj.key.startsWith('thumbnails/');
                          const hasDbRecord = isVideo 
                            ? r2DebugData.databaseVideos.some(v => v.video_url?.includes(obj.key))
                            : isThumbnail
                            ? r2DebugData.databaseVideos.some(v => v.thumbnail_url?.includes(obj.key))
                            : r2DebugData.databaseChannels.some(c => 
                                c.avatar_url?.includes(obj.key) || c.banner_url?.includes(obj.key)
                              );
                          
                          return (
                            <div key={i} className={`flex items-center justify-between text-xs font-mono p-2 rounded ${hasDbRecord ? 'bg-white/5' : 'bg-yellow-500/10 border border-yellow-500/30'}`}>
                              <span className={`truncate flex-1 mr-2 ${hasDbRecord ? 'text-white/80' : 'text-yellow-400'}`}>
                                {!hasDbRecord && '⚠ '}{obj.key}
                              </span>
                              <span className="text-white/50 whitespace-nowrap">{(obj.size / (1024 * 1024)).toFixed(2)} MB</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                    {r2DebugData.truncated && (
                      <p className="text-yellow-400 text-xs mt-1">⚠ List truncated - more than 1000 objects</p>
                    )}
                    <p className="text-white/40 text-xs mt-2">
                      ⚠ Yellow = Orphaned file (exists in R2 but no DB record). These may be from another environment.
                    </p>
                  </div>

                  {/* Database URLs */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-white/70 mb-2">Video URLs in DB</h4>
                      <div className="max-h-40 overflow-y-auto space-y-1 bg-black/30 rounded-lg p-2">
                        {r2DebugData.databaseVideos.map((v) => (
                          <div key={v.id} className="text-xs p-2 bg-white/5 rounded">
                            <div className="text-white/80 font-medium truncate">#{v.id}: {v.title}</div>
                            <div className="text-white/50 font-mono truncate">video: {v.video_url || "null"}</div>
                            <div className="text-white/50 font-mono truncate">thumb: {v.thumbnail_url || "null"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-white/70 mb-2">Channel URLs in DB</h4>
                      <div className="max-h-40 overflow-y-auto space-y-1 bg-black/30 rounded-lg p-2">
                        {r2DebugData.databaseChannels.map((c) => (
                          <div key={c.id} className="text-xs p-2 bg-white/5 rounded">
                            <div className="text-white/80 font-medium truncate">#{c.id}: @{c.handle}</div>
                            <div className="text-white/50 font-mono truncate">avatar: {c.avatar_url || "null"}</div>
                            <div className="text-white/50 font-mono truncate">banner: {c.banner_url || "null"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!r2DebugData && !loadingR2Debug && (
                <p className="text-white/40 text-sm text-center py-4">
                  Click "Scan R2 Storage" to compare R2 files with database records
                </p>
              )}
            </div>
          </>
        )}

        {/* Referrals Tab */}
        {activeTab === "referrals" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-2xl font-bold text-white">{referralSummary?.totalReferrals || 0}</div>
                <div className="text-white/50 text-sm">Total Referrals</div>
              </div>
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                <div className="text-2xl font-bold text-blue-400">{referralSummary?.active || 0}</div>
                <div className="text-blue-400/70 text-sm">In Progress</div>
              </div>
              <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                <div className="text-2xl font-bold text-yellow-400">{referralSummary?.pendingApproval || 0}</div>
                <div className="text-yellow-400/70 text-sm">Pending Approval</div>
              </div>
              <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/30">
                <div className="text-2xl font-bold text-teal-400">{referralSummary?.approved || 0}</div>
                <div className="text-teal-400/70 text-sm">Approved</div>
              </div>
              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                <div className="text-2xl font-bold text-green-400">{referralSummary?.paid || 0}</div>
                <div className="text-green-400/70 text-sm">Paid Out</div>
              </div>
            </div>

            {/* Info Banner */}
            <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20 mb-6">
              <p className="text-teal-400 text-sm flex items-start gap-2">
                <Gift className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Referral Requirements:</strong> Referred user must upload 3 videos (30+ seconds each, unique content) 
                  and watch 10 videos from 5+ different channels. Upon approval, referrer receives 100 KAS and referred user receives 50 KAS.
                </span>
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              {(["pending_approval", "all", "approved", "paid"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setReferralFilter(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    referralFilter === f
                      ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                      : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {f === "pending_approval" ? "Pending" : f.charAt(0).toUpperCase() + f.slice(1)}
                  {f === "pending_approval" && referralSummary && referralSummary.pendingApproval > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 bg-yellow-500 text-black text-xs rounded-full">
                      {referralSummary.pendingApproval}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Referrals List */}
            <div className="space-y-3">
              {filteredReferrals.length === 0 ? (
                <div className="text-center py-12 text-white/50">
                  <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No {referralFilter === "all" ? "" : referralFilter.replace("_", " ")} referrals found</p>
                </div>
              ) : (
                filteredReferrals.map((referral) => (
                  <div
                    key={referral.id}
                    className={`p-4 rounded-xl border ${
                      referral.status === "pending_approval"
                        ? "bg-yellow-500/5 border-yellow-500/20"
                        : referral.status === "paid"
                        ? "bg-green-500/5 border-green-500/20"
                        : referral.status === "rejected"
                        ? "bg-red-500/5 border-red-500/20"
                        : "bg-white/5 border-white/10"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row gap-4">
                      {/* Referrer & Referred Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-6 mb-3">
                          {/* Referrer */}
                          <div className="flex items-center gap-2">
                            {referral.referrer.avatarUrl ? (
                              <img src={referral.referrer.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center">
                                <User className="w-4 h-4 text-teal-400" />
                              </div>
                            )}
                            <div>
                              <div className="text-xs text-white/40">Referrer</div>
                              <div className="text-sm font-medium text-white">@{referral.referrer.handle}</div>
                            </div>
                          </div>
                          
                          <div className="text-white/30">→</div>
                          
                          {/* Referred */}
                          <div className="flex items-center gap-2">
                            {referral.referred.avatarUrl ? (
                              <img src={referral.referred.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                                <User className="w-4 h-4 text-blue-400" />
                              </div>
                            )}
                            <div>
                              <div className="text-xs text-white/40">Referred</div>
                              <div className="text-sm font-medium text-white">@{referral.referred.handle}</div>
                            </div>
                          </div>
                        </div>

                        {/* Progress Stats */}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-white/50">
                          <span className="flex items-center gap-1">
                            <Upload className="w-3 h-3" />
                            {referral.videosUploadedCount}/3 videos uploaded
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {referral.uniqueVideosWatched}/10 videos watched
                          </span>
                          <span className="flex items-center gap-1">
                            <Radio className="w-3 h-3" />
                            {referral.uniqueChannelsWatched}/5 channels
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(referral.createdAt)}
                          </span>
                        </div>

                        {/* Wallet Address (for approval) */}
                        {referral.status === "pending_approval" && (
                          <div className="mt-2 text-xs text-white/40 font-mono truncate">
                            Wallet: {referral.referred.walletAddress}
                          </div>
                        )}
                      </div>

                      {/* Status & Actions */}
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                          referral.status === "pending_approval"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : referral.status === "paid"
                            ? "bg-green-500/20 text-green-400"
                            : referral.status === "approved"
                            ? "bg-teal-500/20 text-teal-400"
                            : referral.status === "rejected"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-blue-500/20 text-blue-400"
                        }`}>
                          {referral.status === "pending_approval" ? "Pending" : referral.status.charAt(0).toUpperCase() + referral.status.slice(1)}
                        </span>

                        {referral.status === "pending_approval" && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReferralAction(referral, "reject")}
                              disabled={processingReferralId === referral.id}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50 flex items-center gap-1"
                            >
                              {processingReferralId === referral.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <XCircle className="w-4 h-4" />
                                  Reject
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleReferralAction(referral, "approve")}
                              disabled={processingReferralId === referral.id}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-500 hover:bg-teal-400 text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                            >
                              {processingReferralId === referral.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle className="w-4 h-4" />
                                  Approve
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        {referral.status === "paid" && referral.paidAt && (
                          <span className="text-xs text-green-400/70">
                            Paid {formatDate(referral.paidAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === "users" && (
          <>
            {/* Search Section */}
            <div className="p-6 rounded-xl bg-white/5 border border-white/10 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Search Users</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Enter wallet address (min 6 characters)..."
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-teal-500/50"
                  onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                />
                <button
                  onClick={searchUsers}
                  disabled={isSearchingUsers}
                  className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSearchingUsers ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Search
                </button>
              </div>
              <p className="text-white/40 text-sm mt-2">
                Search by Kaspa wallet address to find users
              </p>
            </div>

            {/* Search Results */}
            {userSearchResults.length > 0 && (
              <div className="space-y-3 mb-6">
                <h4 className="text-white/60 text-sm font-medium">
                  Found {userSearchResults.length} user{userSearchResults.length !== 1 ? 's' : ''}
                </h4>
                {userSearchResults.map((user, idx) => (
                  <div 
                    key={`${user.userType}-${user.id}-${idx}`}
                    className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer"
                    onClick={() => viewUserDetails(user)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          user.userType === 'google' ? 'bg-blue-500/20' : 'bg-teal-500/20'
                        }`}>
                          {user.userType === 'google' ? (
                            <User className="w-5 h-5 text-blue-400" />
                          ) : (
                            <Wallet className="w-5 h-5 text-teal-400" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              user.userType === 'google' 
                                ? 'bg-blue-500/20 text-blue-400' 
                                : 'bg-teal-500/20 text-teal-400'
                            }`}>
                              {user.userType === 'google' ? 'Google User' : 'External Wallet'}
                            </span>
                            {user.channelHandle && (
                              <span className="text-white font-medium">@{user.channelHandle}</span>
                            )}
                          </div>
                          <p className="text-white/50 text-sm font-mono truncate max-w-[300px]">
                            {user.wallet || user.externalWallet || user.internalWallet || 'No wallet'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-white/40 text-xs">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* User Details Modal */}
            {selectedUser && (
              <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">User Details</h3>
                  <button 
                    onClick={() => setSelectedUser(null)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 text-white/60" />
                  </button>
                </div>

                {loadingUserDetails ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-lg bg-white/5">
                        <p className="text-white/40 text-xs mb-1">User Type</p>
                        <p className={`font-medium ${
                          selectedUser.userType === 'google' ? 'text-blue-400' : 'text-teal-400'
                        }`}>
                          {selectedUser.userType === 'google' ? 'Google User' : 'External Wallet'}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-white/5">
                        <p className="text-white/40 text-xs mb-1">User ID</p>
                        <p className="text-white font-mono text-sm truncate">{selectedUser.id}</p>
                      </div>
                    </div>

                    {selectedUser.channel && (
                      <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/20">
                        <p className="text-teal-400/70 text-xs mb-1">Channel</p>
                        <LocalizedLink 
                          to={`/@${selectedUser.channel.handle}`}
                          className="text-teal-400 font-medium hover:underline"
                        >
                          {selectedUser.channel.name} (@{selectedUser.channel.handle})
                        </LocalizedLink>
                      </div>
                    )}

                    <div className="p-3 rounded-lg bg-white/5">
                      <p className="text-white/40 text-xs mb-1">Wallet Address</p>
                      <p className="text-white font-mono text-sm break-all">
                        {selectedUser.wallet || selectedUser.externalWallet || selectedUser.internalWallet || 'No wallet'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-lg bg-white/5">
                        <p className="text-white/40 text-xs mb-1">Demo Balance</p>
                        <p className="text-white font-medium">
                          {selectedUser.demoBalance ? `${(Number(selectedUser.demoBalance) / 1e8).toFixed(4)} KAS` : 'N/A'}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-white/5">
                        <p className="text-white/40 text-xs mb-1">Created</p>
                        <p className="text-white">
                          {new Date(selectedUser.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {(selectedUser.balanceKas || selectedUser.externalBalanceKas || selectedUser.internalBalanceKas) && (
                      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <p className="text-green-400/70 text-xs mb-1">Live Kaspa Balance</p>
                        <p className="text-green-400 font-medium">
                          {selectedUser.balanceKas || selectedUser.externalBalanceKas || selectedUser.internalBalanceKas} KAS
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {userSearchResults.length === 0 && !selectedUser && (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/50">Search for users by wallet address</p>
              </div>
            )}
          </>
        )}

        {activeTab === "musicReports" && (
          <>
            {/* Filter Buttons */}
            <div className="flex flex-wrap gap-2 mb-6">
              {[
                { key: "pending", label: "Pending" },
                { key: "reviewed", label: "Reviewed" },
                { key: "dismissed", label: "Dismissed" },
                { key: "all", label: "All" }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMusicReportFilter(key as typeof musicReportFilter)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    musicReportFilter === key
                      ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                      : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  {label}
                  {key === "pending" && musicReports.filter(r => r.status === "pending").length > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 bg-yellow-500 text-black text-xs rounded-full">
                      {musicReports.filter(r => r.status === "pending").length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Music Reports List */}
            <div className="space-y-3">
              {musicReports
                .filter(r => musicReportFilter === "all" || r.status === musicReportFilter)
                .map((report) => (
                  <div
                    key={report.id}
                    className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            report.status === "pending"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : report.status === "reviewed"
                              ? "bg-green-500/20 text-green-400"
                              : "bg-white/10 text-white/60"
                          }`}>
                            {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                          </span>
                          <span className="text-white/50 text-xs">
                            {new Date(report.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-3 mb-2">
                          <LocalizedLink
                            to={`/music/artist/${report.profileId}`}
                            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                          >
                            {report.profile?.avatarUrl ? (
                              <img
                                src={report.profile.avatarUrl}
                                alt={report.profile?.name || 'Artist'}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                                <Music className="w-5 h-5 text-white/50" />
                              </div>
                            )}
                            <div>
                              <p className="text-white font-medium">
                                {report.profile?.name || 'Unknown Artist'}
                              </p>
                              <p className="text-white/50 text-sm">Profile ID: {report.profileId}</p>
                            </div>
                          </LocalizedLink>
                        </div>

                        <div className="space-y-1">
                          <p className="text-white/80 text-sm">
                            <span className="text-white/50">Reason:</span>{" "}
                            {report.reason.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          </p>
                          {report.details && (
                            <p className="text-white/60 text-sm">
                              <span className="text-white/50">Details:</span> {report.details}
                            </p>
                          )}
                          <p className="text-white/40 text-xs font-mono truncate">
                            Reporter: {report.reporterWalletAddress}
                          </p>
                          {report.actionTaken && (
                            <p className="text-teal-400 text-sm">
                              Action: {report.actionTaken}
                            </p>
                          )}
                        </div>
                      </div>

                      {report.status === "pending" && (
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={async () => {
                              setProcessingMusicReportId(report.id);
                              try {
                                const res = await fetch(`/api/admin/music-reports/${report.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  credentials: "include",
                                  body: JSON.stringify({ status: "reviewed", actionTaken: "Warning issued to artist" })
                                });
                                if (res.ok) {
                                  setMusicReports(prev => prev.map(r => 
                                    r.id === report.id 
                                      ? { ...r, status: "reviewed", actionTaken: "Warning issued to artist" } 
                                      : r
                                  ));
                                }
                              } finally {
                                setProcessingMusicReportId(null);
                              }
                            }}
                            disabled={processingMusicReportId === report.id}
                            className="px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {processingMusicReportId === report.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            Review
                          </button>
                          <button
                            onClick={async () => {
                              setProcessingMusicReportId(report.id);
                              try {
                                const res = await fetch(`/api/admin/music-reports/${report.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  credentials: "include",
                                  body: JSON.stringify({ status: "dismissed", actionTaken: "Report dismissed - no violation found" })
                                });
                                if (res.ok) {
                                  setMusicReports(prev => prev.map(r => 
                                    r.id === report.id 
                                      ? { ...r, status: "dismissed", actionTaken: "Report dismissed - no violation found" } 
                                      : r
                                  ));
                                }
                              } finally {
                                setProcessingMusicReportId(null);
                              }
                            }}
                            disabled={processingMusicReportId === report.id}
                            className="px-3 py-1.5 bg-white/10 text-white/60 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <X className="w-3 h-3" />
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

              {musicReports.filter(r => musicReportFilter === "all" || r.status === musicReportFilter).length === 0 && (
                <div className="text-center py-12">
                  <Music className="w-12 h-12 text-white/20 mx-auto mb-4" />
                  <p className="text-white/50">
                    {musicReportFilter === "all" 
                      ? "No music profile reports yet" 
                      : `No ${musicReportFilter} reports`}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "reviewPayments" && (
          <>
            {/* Platform Wallet Status */}
            {platformWalletStatus && (
              <div className={`p-4 rounded-xl mb-6 border ${
                platformWalletStatus.canPayRewards 
                  ? 'bg-green-500/10 border-green-500/30' 
                  : 'bg-yellow-500/10 border-yellow-500/30'
              }`}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className={`font-medium ${platformWalletStatus.canPayRewards ? 'text-green-400' : 'text-yellow-400'}`}>
                      Platform Wallet Status
                    </div>
                    <div className="text-sm text-white/60 mt-1">
                      {platformWalletStatus.message}
                    </div>
                    {platformWalletStatus.walletAddress && (
                      <div className="text-xs font-mono text-white/40 mt-1">
                        {platformWalletStatus.walletAddress.slice(0, 20)}...{platformWalletStatus.walletAddress.slice(-8)}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-white">{platformWalletStatus.balance} KAS</div>
                    <div className="text-xs text-white/50">Balance</div>
                  </div>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                <div className="text-2xl font-bold text-red-400">{failedReviewPayments.length}</div>
                <div className="text-red-400/70 text-sm">Failed Payments</div>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-2xl font-bold text-white">
                  {failedReviewPayments.reduce((sum, p) => sum + parseFloat(p.rewardKas || '0.11'), 0).toFixed(2)} KAS
                </div>
                <div className="text-white/50 text-sm">Total Owed</div>
              </div>
              <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/30">
                <button
                  onClick={handleProcessAllPayments}
                  disabled={processingAllPayments || failedReviewPayments.length === 0}
                  className="w-full h-full flex items-center justify-center gap-2 text-teal-400 font-medium disabled:opacity-50"
                >
                  {processingAllPayments ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4" />
                      Process All
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Failed Payments List */}
            <div className="space-y-3">
              {failedReviewPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="p-4 rounded-xl bg-white/5 border border-white/10"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Star className="w-4 h-4 text-yellow-400" />
                        <span className="font-medium text-white truncate">
                          {payment.trackTitle || `Track #${payment.trackId}`}
                        </span>
                        <span className="text-white/50">by</span>
                        <span className="text-white/70">{payment.trackArtist || 'Unknown'}</span>
                      </div>
                      <div className="text-sm text-white/50 mb-2">
                        Rating: {payment.rating}/5 • Review #{payment.id}
                      </div>
                      <div className="text-xs font-mono text-white/40 truncate">
                        Reviewer: {payment.reviewerWallet}
                      </div>
                      {payment.comment && (
                        <p className="text-sm text-white/60 mt-2 italic">
                          "{payment.comment.slice(0, 100)}{payment.comment.length > 100 ? '...' : ''}"
                        </p>
                      )}
                      <div className="text-xs text-white/30 mt-2">
                        {new Date(payment.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">
                        {payment.paymentStatus || 'pending'}{payment.retryCount ? ` (${payment.retryCount} retries)` : ''}
                      </span>
                      <span className="text-lg font-bold text-teal-400">
                        {parseFloat(payment.rewardKas || '0') > 0 ? payment.rewardKas : '0.11'} KAS
                      </span>
                      <button
                        onClick={() => handleRetryPayment(payment.id)}
                        disabled={processingPaymentId === payment.id}
                        className="px-3 py-1.5 bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {processingPaymentId === payment.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <DollarSign className="w-3 h-3" />
                        )}
                        Retry
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {failedReviewPayments.length === 0 && (
                <div className="text-center py-12">
                  <Check className="w-12 h-12 text-green-400/50 mx-auto mb-4" />
                  <p className="text-white/50">No failed review payments</p>
                  <p className="text-white/30 text-sm mt-1">All review rewards have been paid successfully</p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "themeApprovals" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                <div className="text-2xl font-bold text-yellow-400">{pendingThemes.length}</div>
                <div className="text-yellow-400/70 text-sm">Pending Approval</div>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-2xl font-bold text-white">
                  {pendingThemes.filter(t => parseFloat(t.priceKas) > 0).length}
                </div>
                <div className="text-white/50 text-sm">Paid Themes</div>
              </div>
              <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/30">
                <div className="text-2xl font-bold text-teal-400">
                  {pendingThemes.filter(t => parseFloat(t.priceKas) === 0).length}
                </div>
                <div className="text-teal-400/70 text-sm">Free Themes</div>
              </div>
            </div>

            {/* Pending Themes List */}
            <div className="space-y-4">
              {pendingThemes.map((theme) => (
                <div
                  key={theme.id}
                  className="p-4 rounded-xl bg-white/5 border border-white/10"
                >
                  <div className="flex gap-4">
                    {/* Preview Image */}
                    <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-black/50">
                      <img 
                        src={theme.previewImageUrl} 
                        alt={theme.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-white text-lg">{theme.title}</h3>
                          <p className="text-white/60 text-sm mt-1 line-clamp-2">{theme.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-lg font-bold ${parseFloat(theme.priceKas) > 0 ? 'text-green-400' : 'text-blue-400'}`}>
                            {parseFloat(theme.priceKas) > 0 ? `${theme.priceKas} KAS` : 'FREE'}
                          </div>
                          <div className="text-xs text-white/40 mt-0.5">
                            {theme.quantityTotal ? `${theme.quantityTotal} available` : 'Unlimited'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-white/50">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {theme.creatorName || 'Unknown'}
                        </span>
                        {theme.hasParticles && (
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">
                            ✨ Particles
                          </span>
                        )}
                        <span className="font-mono text-white/30">
                          {theme.creatorWalletAddress?.slice(0, 12)}...
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-3 mt-4">
                        {rejectingThemeId === theme.id ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Rejection reason..."
                              className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
                            />
                            <button
                              onClick={() => handleRejectTheme(theme.id)}
                              disabled={processingThemeId === theme.id}
                              className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                              {processingThemeId === theme.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                            </button>
                            <button
                              onClick={() => { setRejectingThemeId(null); setRejectReason(''); }}
                              className="px-4 py-2 bg-white/10 text-white/60 hover:bg-white/20 rounded-lg text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleApproveTheme(theme.id)}
                              disabled={processingThemeId === theme.id}
                              className="px-4 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {processingThemeId === theme.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4" />
                              )}
                              Approve
                            </button>
                            <button
                              onClick={() => setRejectingThemeId(theme.id)}
                              className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm font-medium flex items-center gap-1.5"
                            >
                              <XCircle className="w-4 h-4" />
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {pendingThemes.length === 0 && (
                <div className="text-center py-12">
                  <Palette className="w-12 h-12 text-teal-400/50 mx-auto mb-4" />
                  <p className="text-white/50">No pending theme submissions</p>
                  <p className="text-white/30 text-sm mt-1">New themes will appear here for review</p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "musicProfiles" && (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-white mb-2">Music Profile Management</h2>
              <p className="text-white/50 text-sm mb-4">Search for music profiles and reconnect them to the correct user account.</p>
              
              {/* Current User Info */}
              <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/30 mb-4">
                <p className="text-teal-400 text-sm mb-2">Your Current Gmail Account Info:</p>
                {currentUserInfo ? (
                  <div className="space-y-1 text-sm">
                    <p className="text-white/70">User ID: <span className="font-mono text-white">{currentUserInfo.userId}</span></p>
                    <p className="text-white/70">Wallet: <span className="font-mono text-white text-xs">{currentUserInfo.walletAddress}</span></p>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/users/me", { credentials: "include" });
                        if (res.ok) {
                          const data = await res.json();
                          const walletRes = await fetch("/api/kasshi/wallet", { credentials: "include" });
                          const walletData = walletRes.ok ? await walletRes.json() : { address: "unknown" };
                          setCurrentUserInfo({ userId: data.id, walletAddress: walletData.address || "unknown" });
                        } else {
                          toast.error("Could not load user info - make sure you're logged in with Gmail");
                        }
                      } catch (err) {
                        console.error(err);
                        toast.error("Error loading user info");
                      }
                    }}
                    className="px-3 py-1.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 rounded-lg text-sm"
                  >
                    Load My Info
                  </button>
                )}
              </div>
              
              {/* Search */}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={musicProfileSearch}
                  onChange={(e) => setMusicProfileSearch(e.target.value)}
                  placeholder="Search by profile name or leave empty for all"
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                />
                <button
                  onClick={async () => {
                    setIsSearchingProfiles(true);
                    try {
                      const res = await fetch(`/api/admin/music-profiles/search?q=${encodeURIComponent(musicProfileSearch)}`, { credentials: "include" });
                      if (res.ok) {
                        const data = await res.json();
                        setMusicProfileResults(data.profiles || []);
                      }
                    } catch (err) {
                      console.error(err);
                    }
                    setIsSearchingProfiles(false);
                  }}
                  disabled={isSearchingProfiles}
                  className="px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-xl disabled:opacity-50"
                >
                  {isSearchingProfiles ? <Loader2 className="w-5 h-5 animate-spin" /> : musicProfileSearch.trim() ? "Search" : "Show All"}
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="space-y-3">
              {musicProfileResults.map(profile => (
                <div key={profile.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-4 mb-3">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                        <User className="w-6 h-6 text-white/30" />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-white">{profile.name}</p>
                      {profile.handle && <p className="text-white/50 text-sm">@{profile.handle}</p>}
                    </div>
                  </div>
                  <div className="text-xs text-white/40 space-y-1 mb-3">
                    <p>Profile ID: {profile.id}</p>
                    <p>Wallet: {profile.wallet_address || "none"}</p>
                    <p>User ID: {profile.user_id || "none"}</p>
                    <p>Created: {new Date(profile.created_at).toLocaleString()}</p>
                  </div>
                  
                  {updatingProfileId === profile.id ? (
                    <div className="space-y-3 p-3 bg-white/5 rounded-lg">
                      <div>
                        <label className="text-white/50 text-xs">New Wallet Address:</label>
                        <input
                          type="text"
                          value={profileUpdateData.walletAddress}
                          onChange={(e) => setProfileUpdateData(prev => ({ ...prev, walletAddress: e.target.value }))}
                          placeholder="kaspa:..."
                          className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-sm font-mono mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-white/50 text-xs">New User ID (for Gmail accounts):</label>
                        <input
                          type="text"
                          value={profileUpdateData.userId}
                          onChange={(e) => setProfileUpdateData(prev => ({ ...prev, userId: e.target.value }))}
                          placeholder="019c1067-..."
                          className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-sm font-mono mt-1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setUpdatingProfileId(null);
                            setProfileUpdateData({ walletAddress: "", userId: "" });
                          }}
                          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/admin/music-profiles/${profile.id}/wallet`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                credentials: "include",
                                body: JSON.stringify({
                                  walletAddress: profileUpdateData.walletAddress || profile.wallet_address,
                                  userId: profileUpdateData.userId || undefined
                                })
                              });
                              if (res.ok) {
                                // Refresh search
                                const searchRes = await fetch(`/api/admin/music-profiles/search?q=${encodeURIComponent(musicProfileSearch)}`, { credentials: "include" });
                                if (searchRes.ok) {
                                  const data = await searchRes.json();
                                  setMusicProfileResults(data.profiles || []);
                                }
                                setUpdatingProfileId(null);
                                setProfileUpdateData({ walletAddress: "", userId: "" });
                              }
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-sm"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setUpdatingProfileId(profile.id);
                        setProfileUpdateData({ 
                          walletAddress: profile.wallet_address || "", 
                          userId: profile.user_id || "" 
                        });
                      }}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm"
                    >
                      Edit Profile Connection
                    </button>
                  )}
                </div>
              ))}

              {musicProfileResults.length === 0 && musicProfileSearch && !isSearchingProfiles && (
                <div className="text-center py-12">
                  <User className="w-12 h-12 text-teal-400/50 mx-auto mb-4" />
                  <p className="text-white/50">No profiles found</p>
                  <p className="text-white/30 text-sm mt-1">Try a different search term</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Reassign Modal */}
      {reassignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0a0f14] border border-white/10 rounded-2xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Reassign Channel</h2>
            <p className="text-white/60 text-sm mb-4">
              Change the wallet address for <strong>@{reassignModal.handle}</strong>
            </p>
            <input
              type="text"
              value={newWalletAddress}
              onChange={(e) => setNewWalletAddress(e.target.value)}
              placeholder="kaspa:..."
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setReassignModal(null)}
                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleReassignChannel}
                disabled={isReassigning}
                className="flex-1 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg disabled:opacity-50"
              >
                {isReassigning ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0a0f14] border border-white/10 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Report Details</h2>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Video Preview */}
              <LocalizedLink
                to={`/video/watch/${selectedReport.videoId}`}
                target="_blank"
                className="block rounded-xl overflow-hidden bg-white/10 hover:opacity-80 transition-opacity"
              >
                {selectedReport.video?.thumbnailUrl ? (
                  <img 
                    src={selectedReport.video.thumbnailUrl} 
                    alt={selectedReport.video?.title || 'Video'}
                    className="w-full aspect-video object-cover"
                  />
                ) : (
                  <div className="w-full aspect-video flex items-center justify-center">
                    <Video className="w-12 h-12 text-white/30" />
                  </div>
                )}
              </LocalizedLink>
              
              <div>
                <h3 className="font-medium text-white">{selectedReport.video?.title || 'Deleted Video'}</h3>
                <p className="text-sm text-white/50">Video ID: {selectedReport.videoId}</p>
              </div>

              {/* Report Info */}
              <div className="space-y-2 p-3 bg-white/5 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Reporter:</span>
                  <span className="text-white">@{selectedReport.reporter?.handle || 'Unknown'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Reason:</span>
                  <span className="text-white">{getReasonLabel(selectedReport.reason)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Reported:</span>
                  <span className="text-white">{formatDate(selectedReport.createdAt)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Status:</span>
                  <span className={`font-medium ${
                    selectedReport.status === "pending"
                      ? "text-yellow-400"
                      : selectedReport.status === "reviewed"
                      ? "text-green-400"
                      : "text-slate-400"
                  }`}>
                    {selectedReport.status}
                  </span>
                </div>
                {selectedReport.actionTaken && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Action:</span>
                    <span className="text-green-400">{selectedReport.actionTaken}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {selectedReport.status === "pending" && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleDismissReport(selectedReport)}
                    disabled={isDismissing || isDeleting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-50"
                  >
                    {isDismissing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <X className="w-4 h-4" />
                        Dismiss
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteVideo(selectedReport)}
                    disabled={isDismissing || isDeleting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Delete Video
                      </>
                    )}
                  </button>
                </div>
              )}

              {selectedReport.status !== "pending" && (
                <div className="p-3 rounded-lg bg-white/5 text-center text-white/50 text-sm">
                  This report has already been {selectedReport.status}
                </div>
              )}

              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-yellow-400 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Deleting a video permanently removes it and all associated data (comments, likes, etc). This action cannot be undone.</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
