import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 
  | 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' 
  | 'ru' | 'zh' | 'ja' | 'ko' | 'ar' | 'hi'
  | 'tr' | 'nl' | 'pl' | 'vi' | 'th' | 'id';

export const languages: { code: Language; name: string; nativeName: string; flag: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
];

// Translation keys type
export interface Translations {
  // Navigation
  nav: {
    home: string;
    explore: string;
    upload: string;
    settings: string;
    dashboard?: string;
    search: string;
    notifications: string;
    wallet: string;
    myChannel: string;
  };
  // Home page
  home: {
    forYou: string;
    freeToWatch: string;
    following: string;
    membersOnly: string;
    history: string;
    referEarn: string;
    noVideos: string;
    noFollowing: string;
    noMembers: string;
    noHistory: string;
    videoCompetition?: string;
    live?: string;
    uniqueChannels?: string;
    currentLeader?: string;
    ends?: string;
    required?: string;
    noVideosYet?: string;
    mostLikedWins?: string;
    minChannelsRequired?: string;
    topLiked?: string;
    ongoing?: string;
    status?: string;
    perpetualCompetition?: string;
  };
  // Auth/Wallet
  auth: {
    connectWallet: string;
    signInGoogle: string;
    connectKasWare: string;
    connectKastle: string;
    importSeed: string;
    walletAutoCreated: string;
    bestForNewcomers: string;
    useYourWallet: string;
    bestForCrypto: string;
    perfectForMobile: string;
    allOptionsInfo: string;
    connecting: string;
    disconnect: string;
    balance: string;
    deposit: string;
    withdraw: string;
    myWallet: string;
    // WalletModal strings
    yourWallet?: string;
    connectDesc?: string;
    installKasWare?: string;
    installKastle?: string;
    importWallet?: string;
    seedPhraseDesc?: string;
    seedPhrasePlaceholder?: string;
    importing?: string;
    seedPhraseWarning?: string;
    loadingWallet?: string;
    kaspaMainnet?: string;
    address?: string;
    viewOnExplorer?: string;
    depositViaQR?: string;
    scanQRDesc?: string;
    mainnetInfo?: string;
    learnMoreKaspa?: string;
    kasshiWallet?: string;
    micropayments?: string;
    settingUpWallet?: string;
    fromWallet?: string;
    available?: string;
    amountMin?: string;
    max?: string;
    processing?: string;
    depositToKasShi?: string;
    depositsInfo?: string;
    fromKasShi?: string;
    withdrawTo?: string;
    withdrawEarningsInfo?: string;
    external?: string;
    disconnectWallet?: string;
    disconnectConfirm?: string;
    kaswareInfo?: string;
    loadWalletError?: string;
    balanceUpdated?: string;
    copiedToClipboard?: string;
    walletDisconnected?: string;
    minDeposit?: string;
    minWithdraw?: string;
    depositedSuccess?: string;
    depositWithdrawDesc?: string;
    couldNotLoadWallet?: string;
    importWalletTitle?: string;
    enterSeedPhrase?: string;
    neverShareSeed?: string;
    mainnetWalletDesc?: string;
    depositsEnableDesc?: string;
    withdrawEarningsDesc?: string;
    wallet?: string;
    // WalletModal additional strings
    walletConnectedSuccess?: string;
    insufficientBalance?: string;
    insufficientKasshiBalance?: string;
    failedProcessDeposit?: string;
    failedProcessWithdraw?: string;
    depositFailed?: string;
    withdrawalFailed?: string;
    failedAuthChallenge?: string;
    failedSignMessage?: string;
    authenticationFailed?: string;
    failedConnectWallet?: string;
    viewOnKaspaExplorer?: string;
    logout?: string;
    loggedOut?: string;
  };
  // Video
  video: {
    views: string;
    likes: string;
    dislikes: string;
    comments: string;
    share: string;
    bookmark: string;
    report: string;
    subscribe: string;
    subscribed: string;
    tip: string;
    joinMembership: string;
    membersOnly: string;
    addComment: string;
    reply: string;
    showReplies: string;
    hideReplies: string;
    noComments: string;
    watched: string;
    new: string;
    relatedVideos: string;
    membersOnlyTitle?: string;
    membersOnlyDesc?: string;
    joinCommunity?: string;
    memberBenefits?: string;
    viewMembershipOptions?: string;
    checkingMembership?: string;
    payToWatch?: string;
    payToWatchDesc?: string;
    retryPayment?: string;
    free?: string;
    paid?: string;
    insufficientBalance?: string;
    signInToWatch?: string;
    signInToWatchDesc?: string;
    creatorGetsPercent?: string;
    tipCreator?: string;
    tipAmount?: string;
    copyLink?: string;
    noRelatedVideos?: string;
    thankYouWatching?: string;
    beFirstComment?: string;
    comment?: string;
    replyTo?: string;
    videoNotFound?: string;
    videoNotFoundDesc?: string;
    backToHome?: string;
    buffering?: string;
    seeking?: string;
    preparing?: string;
    videoPlaybackIssue?: string;
    tryTheseFixes?: string;
    tryAgain?: string;
    openInNewTab?: string;
    download?: string;
    resumeFrom?: string;
    subscribers?: string;
    edit?: string;
    shareOnX?: string;
    shareOnFacebook?: string;
    like?: string;
    dislike?: string;
    liked?: string;
    unliked?: string;
    disliked?: string;
    undisliked?: string;
    posted?: string;
    connectToLike?: string;
    connectToDislike?: string;
    connectToComment?: string;
    connectToShare?: string;
    quality?: string;
    originalQuality?: string;
    replies?: string;
    noDescription?: string;
    sendTip?: string;
    reportVideo?: string;
    selectReportReason?: string;
    processing?: string;
    private?: string;
    uploaded?: string;
    encoding?: string;
    videoProcessing?: string;
    autoRefresh?: string;
    encodingFailed?: string;
    encodingFailedDesc?: string;
    recordedOnBlockDAG?: string;
    // EditVideo strings
    editVideo?: string;
    preview?: string;
    thumbnail?: string;
    uploadThumbnail?: string;
    randomFrameFromVideo?: string;
    hoverToChangeThumbnail?: string;
    enterVideoTitle?: string;
    tellViewersAboutVideo?: string;
    membersOnlyToggle?: string;
    onlyMembersCanWatch?: string;
    privateVideo?: string;
    onlyYouCanSee?: string;
    savingChanges?: string;
    savingChangesCost?: string;
    saveChanges?: string;
    saving?: string;
    dangerZone?: string;
    deleteVideo?: string;
    deleteVideoConfirm?: string;
    deleteVideoWarning?: string;
    deleting?: string;
    canOnlyEditOwnVideos?: string;
    backToVideo?: string;
    goHome?: string;
  };
  // Upload
  upload: {
    title: string;
    uploadVideo: string;
    dragDrop: string;
    or: string;
    browse: string;
    videoTitle: string;
    description: string;
    thumbnail: string;
    visibility: string;
    public: string;
    private: string;
    privateDesc: string;
    membersOnly: string;
    membersOnlyOption: string;
    membersOnlyDesc: string;
    uploadFee: string;
    publish: string;
    uploading: string;
    processing: string;
    success: string;
    connectWalletDesc: string;
    createChannelDesc: string;
    channelName: string;
    channelHandle: string;
    clickToUploadCustom?: string;
    randomFrame?: string;
    videoPrice?: string;
    videoPriceDesc?: string;
    minPriceNote?: string;
    earningsStructure?: string;
    viewPayments?: string;
    subscriptionEarnings?: string;
    tipsAndMemberships?: string;
    oneTimeFee?: string;
    under1GB?: string;
    over5GB?: string;
    // Additional upload strings
    handleHint?: string;
    loadingDuration?: string;
    uploadThumbnail?: string;
    autoGeneratedOrCustom?: string;
    titlePlaceholder?: string;
    descriptionPlaceholder?: string;
    fileSizeUnder1GB?: string;
    fileSizeOver5GB?: string;
    fileSize1to5GB?: string;
    insufficientBalanceAmount?: string;
    percentComplete?: string;
    invalidFileType?: string;
    fileTooLarge?: string;
    // Draft recovery
    resumePreviousUpload?: string;
    restoreDraft?: string;
    discardDraft?: string;
    unsavedDraft?: string;
    // Channel creation
    channelCreatedSuccess?: string;
    handleLettersOnly?: string;
    handleMinLength?: string;
    selectSameFile?: string;
    // Thumbnail
    generatingThumbnail?: string;
    thumbnailGenerated?: string;
    regeneratingThumbnail?: string;
    newThumbnailGenerated?: string;
    failedGenerateThumbnail?: string;
    failedLoadVideo?: string;
    removeVideo?: string;
  };
  // Channel
  channel: {
    subscribers: string;
    videos: string;
    membership: string;
    about: string;
    joined: string;
    totalViews: string;
    noVideos: string;
    editChannel: string;
    createChannel: string;
    myVideos?: string;
    liked?: string;
    kasEarnedTotal?: string;
    noDescription?: string;
    // Edit channel strings
    channelName?: string;
    yourChannelName?: string;
    handle?: string;
    handleDesc?: string;
    description?: string;
    descriptionHint?: string;
    aboutSection?: string;
    aboutHint?: string;
    avatar?: string;
    uploadAvatar?: string;
    uploading?: string;
    banner?: string;
    uploadBanner?: string;
    bannerHint?: string;
    avatarHint?: string;
    channelLinks?: string;
    linksDesc?: string;
    linkTitle?: string;
    linkUrl?: string;
    addLink?: string;
    yourWallet?: string;
    notificationsEnabled?: string;
    notificationsDisabled?: string;
    getNotified?: string;
    linkCopied?: string;
    creatorNoDescription?: string;
    stats?: string;
    kasEarned?: string;
    createMembershipTier?: string;
    tierName?: string;
    tierPrice?: string;
    tierDescription?: string;
    tierBenefits?: string;
    membershipExpired?: string;
    membershipActive?: string;
    expiredOn?: string;
    expiresOn?: string;
    accessUntil?: string;
    renewAccess?: string;
    renewMembership?: string;
    renewToKeepAccess?: string;
    active?: string;
    upgrade?: string;
    purchase?: string;
    processing?: string;
    links?: string;
    addNewLink?: string;
    manageLinks?: string;
    manageVideos?: string;
    insufficientBalance?: string;
    tierPriceHint?: string;
    tierDescriptionHint?: string;
    linkTitlePlaceholder?: string;
    members?: string;
    private?: string;
    checkOut?: string;
  };
  // Settings
  settings: {
    title: string;
    account: string;
    security: string;
    wallet: string;
    referrals: string;
    memberships?: string;
    rules?: string;
    about?: string;
    appearance: string;
    appearanceDesc?: string;
    language: string;
    theme: string;
    lightMode: string;
    darkMode: string;
    systemMode: string;
    kaspaTheme?: string;
    kaspaThemeDesc?: string;
    darkTheme?: string;
    darkThemeDesc?: string;
    lightTheme?: string;
    lightThemeDesc?: string;
    signOut: string;
    notifications?: string;
    notificationsDesc?: string;
    commentNotifications?: string;
    commentNotificationsDesc?: string;
    deleteAccount: string;
    withdraw?: string;
    withdrawAddress?: string;
    withdrawAmount?: string;
    withdrawAll?: string;
    depositKas?: string;
    scanQr?: string;
    copyAddress?: string;
    addressCopied?: string;
    utxoManagement?: string;
    consolidateWallet?: string;
    consolidating?: string;
    twoFactorAuth?: string;
    enable2fa?: string;
    disable2fa?: string;
    transactionPassword?: string;
    enablePassword?: string;
    // Additional settings strings
    yourMemberships?: string;
    active?: string;
    expiresDate?: string;
    totalPaid?: string;
    inviteFriends?: string;
    earnPerReferral?: string;
    referralRewards?: string;
    youGet?: string;
    friendGets?: string;
    eligibilityRequirements?: string;
    accountAge?: string;
    publishedVideos?: string;
    yourReferralLink?: string;
    totalReferrals?: string;
    thisWeek?: string;
    kasEarned?: string;
    yourReferrals?: string;
    inProgress?: string;
    paid?: string;
    pending?: string;
    rejected?: string;
    generateReferralLink?: string;
    creating?: string;
    createChannelToRefer?: string;
    signInToAccessReferrals?: string;
    referralLimits?: string;
    communityGuidelines?: string;
    whatYouNeedToKnow?: string;
    freeSpeech?: string;
    freeSpeechDesc?: string;
    coreValue?: string;
    prohibitedContent?: string;
    notAllowed?: string;
    uploadVideos?: string;
    watchVideos?: string;
    differentChannels?: string;
    waitingPeriod?: string;
    daysRemaining?: string;
    requirementsMet?: string;
    awaitingPayout?: string;
    rewardClaimed?: string;
    signInToManageSecurity?: string;
    externalWalletSecurity?: string;
    externalWalletNotice?: string;
    currentPassword?: string;
    viewRecoveryPhraseBtn?: string;
    forgotPassword?: string;
    passwordRecoveryPhrase?: string;
    enterRecoveryPhrase?: string;
    newPasswordPlaceholder?: string;
    reset?: string;
    view?: string;
    disable?: string;
    disablePassword?: string;
    recoveryPhrase?: string;
    viewRecoveryPhrase?: string;
    copied?: string;
    userId?: string;
    channelInfo?: string;
    createChannel?: string;
    noChannel?: string;
    pendingBalance?: string;
    settleNow?: string;
    settling?: string;
    activeMemberships?: string;
    noMemberships?: string;
    expiresOn?: string;
    referralProgram?: string;
    yourReferralCode?: string;
    shareCode?: string;
    referralStats?: string;
    totalReferred?: string;
    pendingRewards?: string;
    withdrawDesc?: string;
    availableBalance?: string;
    walletBalance?: string;
    balanceBreakdown?: string;
    onChainBalance?: string;
    pendingOutgoing?: string;
    balance?: string;
    // Security section (optional)
    twoFactorAuthDesc?: string;
    twoFactorAuthHint?: string;
    codeCopied?: string;
    enterSixDigitCode?: string;
    verifyAndEnable?: string;
    enterCodeToDisable?: string;
    walletRecoveryPhrase?: string;
    walletMasterKey?: string;
    backedUp?: string;
    twentyFourWords?: string;
    transactionPasswordPlaceholder?: string;
    neverShare?: string;
    hide?: string;
    optionalSecurity?: string;
    protectsLargeTransactions?: string;
    setTransactionPassword?: string;
    confirmPassword?: string;
    requireOnLargeTransactions?: string;
    requireOnLogin?: string;
    enterPasswordToView?: string;
    enterPasswordToDisable?: string;
    orEnterManually?: string;
    sixDigitCode?: string;
    enabled?: string;
    // Memberships section (optional)
    kasPerMonth?: string;
    noActiveMemberships?: string;
    joinMembershipsDesc?: string;
    // Referrals section (optional)
    yourReferralReward?: string;
    referredBy?: string;
    youReceived?: string;
    paidOn?: string;
    completeTasksToEarn?: string;
    daysLeft?: string;
    videosRule?: string;
    videoCount?: string;
    watchCount?: string;
    meetsRequirements?: string;
    youWillReceive?: string;
    onceApproved?: string;
    youHave?: string;
    tryAgain?: string;
    // Rules section (optional)
    guidelinesIntro?: string;
    hypersexualContent?: string;
    hypersexualDesc?: string;
    violenceAbuse?: string;
    violenceDesc?: string;
    legalNotices?: string;
    important?: string;
    legalDesc?: string;
    rulesFooter?: string;
    // About section (optional)
    howKasshiWorks?: string;
    everyInteraction?: string;
    watchVideosDesc?: string;
    uploadVideosDesc?: string;
    subscribe?: string;
    subscribeDesc?: string;
    engagement?: string;
    engagementDesc?: string;
    kaspaConfirms?: string;
    learnMore?: string;
    legalAndPolicies?: string;
    privacyTermsMore?: string;
    viewAllLegal?: string;
    openSource?: string;
    viewOnGitHub?: string;
    // Wallet section - additional
    signedInAs?: string;
    logOut?: string;
    copy?: string;
    walletLabel?: string;
    pendingKas?: string;
    balanceBreakdownDesc?: string;
    batchThresholdDesc?: string;
    toThreshold?: string;
    adminDashboard?: string;
    adminDashboardDesc?: string;
    walletModeAdmin?: string;
    walletModeDesc?: string;
    demo?: string;
    mainnet?: string;
    demoLabel?: string;
    mainnetLabel?: string;
    walletNeedsConsolidation?: string;
    consolidationNeeded?: string;
    utxoManagementDesc?: string;
    walletUtxos?: string;
    destinationAddress?: string;
    max?: string;
    sendKas?: string;
    signInToAccessWallet?: string;
    goToHome?: string;
    amountKas?: string;
    twoFactorManagedByKasWare?: string;
    recoveryManagedByKasWare?: string;
  };
  // Common
  common: {
    loading: string;
    error: string;
    save: string;
    cancel: string;
    confirm: string;
    delete: string;
    edit: string;
    create: string;
    back: string;
    next: string;
    done: string;
    close: string;
    search: string;
    noResults: string;
    seeMore: string;
    seeLess: string;
    processing: string;
    or?: string;
    more?: string;
    sending?: string;
    tryAgain?: string;
    complete?: string;
    connecting?: string;
    leaderboard?: string;
    featuredChannels?: string;
    noChannels?: string;
  };
  // Time
  time: {
    now: string;
    recently?: string;
    minute: string;
    minutes: string;
    hour: string;
    hours: string;
    day: string;
    days: string;
    week: string;
    weeks: string;
    month: string;
    months: string;
    year: string;
    years: string;
    ago: string;
    agoFormat?: string; // Format pattern: "{n} {unit} ago" or "il y a {n} {unit}"
  };
  // Search page
  search?: {
    searchResultsFor?: string;
    resultsFound?: string;
    resultFound?: string;
    searching?: string;
    all?: string;
    videos?: string;
    channels?: string;
    noResultsFound?: string;
    tryDifferentKeywords?: string;
    searchKasshi?: string;
    findVideosAndChannels?: string;
    subscribers?: string;
  };
  // Footer
  footer?: {
    privacy: string;
    terms: string;
    dmca: string;
    kaspa: string;
    riskWarning: string;
  };
  // Notifications
  notifications?: {
    title?: string;
    markAllRead?: string;
    clearAll?: string;
    noNotifications?: string;
    transactionUpdatesHere?: string;
    justNow?: string;
  };
  // Leaderboard
  leaderboard?: {
    title?: string;
    musicArtists?: string;
    podcasters?: string;
    totalPlays?: string;
    tracks?: string;
    podcasts?: string;
    episodes?: string;
    noArtists?: string;
    noPodcasters?: string;
    plays?: string;
  };
  // Account Activity
  activity?: {
    title?: string;
    subtitle?: string;
    subscribers?: string;
    likes?: string;
    comments?: string;
    subscribed?: string;
    likedYourVideo?: string;
    noSubscribers?: string;
    noSubscribersDesc?: string;
    noLikes?: string;
    noLikesDesc?: string;
    noComments?: string;
    noCommentsDesc?: string;
    on?: string;
  };
}

// English translations (base)
const en: Translations = {
  nav: {
    home: 'Home',
    explore: 'Explore',
    upload: 'Upload',
    settings: 'Settings',
    dashboard: 'Dashboard',
    search: 'Search',
    notifications: 'Notifications',
    wallet: 'Wallet',
    myChannel: 'My Channel',
  },
  home: {
    forYou: 'For You',
    freeToWatch: 'Free to Watch',
    following: 'Following',
    membersOnly: 'Members Only',
    history: 'History',
    referEarn: 'Refer & Earn 100 KAS',
    noVideos: 'No videos yet',
    noFollowing: 'Subscribe to channels to see their videos here',
    noMembers: 'Join memberships to see exclusive content',
    noHistory: 'Videos you watch will appear here',
    videoCompetition: 'Video Competition',
    live: 'LIVE',
    uniqueChannels: 'Unique Channels',
    currentLeader: 'Current Leader',
    ends: 'Ends',
    required: 'required',
    noVideosYet: 'No videos yet',
    mostLikedWins: 'Most liked video wins',
    minChannelsRequired: 'videos from unique channels required for payout',
    topLiked: 'Top 3 Most Liked',
    ongoing: 'Ongoing',
    status: 'Status',
    perpetualCompetition: 'Perpetual Competition',
  },
  auth: {
    connectWallet: 'Connect Wallet',
    signInGoogle: 'Sign in with Google',
    connectKasWare: 'Connect KasWare Wallet',
    connectKastle: 'Connect Kastle Wallet',
    importSeed: 'Import with Seed Phrase',
    walletAutoCreated: 'Wallet auto-created',
    bestForNewcomers: 'Best for newcomers to crypto',
    useYourWallet: 'Use your own wallet',
    bestForCrypto: 'Best for crypto-native users',
    perfectForMobile: 'Perfect for mobile wallet users',
    allOptionsInfo: 'All options let you earn and spend KAS on KasShi with frictionless micropayments.',
    connecting: 'Connecting...',
    disconnect: 'Disconnect',
    balance: 'Balance',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    myWallet: 'My Wallet',
    yourWallet: 'Your Wallet',
    connectDesc: 'Connect to start watching, earning, and supporting creators with KAS',
    installKasWare: 'Install KasWare Wallet',
    installKastle: 'Install Kastle Wallet',
    importWallet: 'Import Wallet',
    seedPhraseDesc: 'Enter your 12 or 24-word seed phrase from Kastle, KasWare, or any Kaspa wallet.',
    seedPhrasePlaceholder: 'Enter your seed phrase...',
    importing: 'Importing...',
    seedPhraseWarning: 'Never share your seed phrase. KasShi derives your wallet locally and never stores your phrase.',
    loadingWallet: 'Loading your wallet...',
    kaspaMainnet: 'Kaspa Mainnet',
    address: 'Address',
    viewOnExplorer: 'View on Kaspa Explorer',
    depositViaQR: 'Deposit via QR Code',
    scanQRDesc: 'Scan with your Kaspa wallet app to send KAS to this address',
    mainnetInfo: 'This is a real Kaspa mainnet wallet. All transactions use real KAS and are recorded on the blockchain.',
    learnMoreKaspa: 'Learn more about Kaspa',
    kasshiWallet: 'KasShi Wallet',
    micropayments: 'Micropayments',
    settingUpWallet: 'Setting up wallet...',
    fromWallet: 'From',
    available: 'Available',
    amountMin: 'Amount (min 0.1)',
    max: 'MAX',
    processing: 'Processing...',
    depositToKasShi: 'Deposit to KasShi',
    depositsInfo: 'Deposits enable frictionless micropayments on KasShi',
    fromKasShi: 'From: KasShi Wallet',
    withdrawTo: 'Withdraw to',
    withdrawEarningsInfo: 'Withdraw your earnings to your wallet',
    external: 'External',
    disconnectWallet: 'Disconnect Wallet',
    disconnectConfirm: 'Are you sure you want to disconnect your wallet? You can reconnect anytime.',
    kaswareInfo: 'Deposit KAS to your KasShi wallet for instant micropayments. Withdraw anytime to your wallet.',
    loadWalletError: 'Could not load wallet. Please try refreshing the page.',
    balanceUpdated: 'Balance updated',
    copiedToClipboard: 'Copied to clipboard',
    walletDisconnected: 'Wallet disconnected',
    // WalletModal additional strings
    walletConnectedSuccess: 'Wallet connected successfully!',
    insufficientBalance: 'Insufficient balance',
    insufficientKasshiBalance: 'Insufficient KasShi wallet balance',
    failedProcessDeposit: 'Failed to process deposit',
    failedProcessWithdraw: 'Failed to process withdrawal',
    depositFailed: 'Deposit failed',
    withdrawalFailed: 'Withdrawal failed',
    failedAuthChallenge: 'Failed to get auth challenge',
    failedSignMessage: 'Failed to sign message',
    authenticationFailed: 'Authentication failed',
    failedConnectWallet: 'Failed to connect wallet',
    viewOnKaspaExplorer: 'View on Kaspa Explorer',
    logout: 'Log Out',
    loggedOut: 'Logged out successfully',
  },
  video: {
    views: 'views',
    likes: 'likes',
    dislikes: 'dislikes',
    comments: 'comments',
    share: 'Share',
    bookmark: 'Bookmark',
    report: 'Report',
    subscribe: 'Subscribe',
    subscribed: 'Subscribed',
    tip: 'Tip',
    joinMembership: 'Join Membership',
    membersOnly: 'Members Only',
    addComment: 'Add a comment...',
    reply: 'Reply',
    showReplies: 'Show replies',
    hideReplies: 'Hide replies',
    noComments: 'No comments yet',
    watched: 'Watched',
    new: 'New',
    relatedVideos: 'Related Videos',
    membersOnlyTitle: 'Members Only',
    membersOnlyDesc: 'This exclusive content is only available to members.',
    joinCommunity: 'Join the community!',
    memberBenefits: 'Get access to exclusive videos, behind-the-scenes content, and more.',
    viewMembershipOptions: 'View Membership Options',
    checkingMembership: 'Checking membership access...',
    payToWatch: 'Pay to Watch',
    payToWatchDesc: 'This video requires a small payment to watch. Your KAS goes directly to the creator.',
    retryPayment: 'Retry Payment',
    free: 'Free',
    paid: 'Paid',
    insufficientBalance: 'Add more KAS to your wallet to watch this video',
    signInToWatch: 'Sign in to Watch',
    signInToWatchDesc: 'Create an account or sign in to watch videos on KasShi. Each view supports creators directly with KAS.',
    creatorGetsPercent: '95% goes directly to the creator',
    tipCreator: 'Tip Creator',
    tipAmount: 'Tip Amount (KAS)',
    copyLink: 'Copy link',
    noRelatedVideos: 'No related videos yet.',
    thankYouWatching: 'Thank you for watching!',
    beFirstComment: 'Be the first to comment!',
    comment: 'Comment',
    replyTo: 'Reply to',
    videoNotFound: 'Video not found',
    videoNotFoundDesc: 'This video may have been removed or doesn\'t exist.',
    backToHome: 'Back to Home',
    buffering: 'Buffering...',
    seeking: 'Loading...',
    preparing: 'Preparing video...',
    videoPlaybackIssue: 'Video Playback Issue',
    tryTheseFixes: 'Try these fixes:',
    tryAgain: 'Try Again',
    openInNewTab: 'Open in New Tab',
    download: 'Download',
    resumeFrom: 'Resume from',
    subscribers: 'subscribers',
    edit: 'Edit',
    shareOnX: 'Share on X',
    shareOnFacebook: 'Share on Facebook',
    like: 'Like',
    dislike: 'Dislike',
    liked: 'Liked!',
    unliked: 'Unliked!',
    disliked: 'Disliked!',
    undisliked: 'Undisliked!',
    posted: 'posted!',
    connectToLike: 'Connect wallet to like',
    connectToDislike: 'Connect wallet to dislike',
    connectToComment: 'Connect wallet to comment',
    connectToShare: 'Connect wallet to share',
    quality: 'Quality',
    originalQuality: 'Original quality • No transcoding',
    replies: 'replies',
    noDescription: 'No description available.',
    sendTip: 'Send Tip',
    reportVideo: 'Report Video',
    selectReportReason: 'Select a reason for reporting this video.',
    uploaded: 'Uploaded',
    encoding: 'Encoding',
    videoProcessing: 'Your video is being processed for optimal playback. This may take a few minutes.',
    autoRefresh: 'This page will automatically refresh when ready.',
    encodingFailed: 'Encoding Failed',
    encodingFailedDesc: 'There was an error processing this video. Please try uploading again or contact support.',
    recordedOnBlockDAG: 'Recorded on the Kaspa BlockDAG',
    // EditVideo strings
    editVideo: 'Edit Video',
    preview: 'Preview',
    thumbnail: 'Thumbnail',
    uploadThumbnail: 'Upload thumbnail',
    randomFrameFromVideo: 'Random frame from video',
    hoverToChangeThumbnail: 'Hover to change thumbnail. Upload an image or generate from video.',
    enterVideoTitle: 'Enter video title',
    tellViewersAboutVideo: 'Tell viewers about your video',
    membersOnlyToggle: 'Members Only',
    onlyMembersCanWatch: 'Only channel members can watch this video',
    privateVideo: 'Private Video',
    onlyYouCanSee: 'Only you can see this video',
    savingChanges: 'Saving changes costs',
    savingChangesCost: 'KAS (batched for efficiency)',
    saveChanges: 'Save Changes',
    saving: 'Saving...',
    dangerZone: 'Danger Zone',
    deleteVideo: 'Delete Video',
    deleteVideoConfirm: 'Are you sure you want to delete this video?',
    deleteVideoWarning: 'This action cannot be undone. All views, comments, likes, and earnings data will be permanently deleted.',
    deleting: 'Deleting...',
    canOnlyEditOwnVideos: 'You can only edit your own videos',
    backToVideo: 'Back to video',
    goHome: 'Go home',
  },
  upload: {
    title: 'Share your content and earn KAS from every view',
    uploadVideo: 'Upload Video',
    dragDrop: 'Drag and drop video files to upload',
    or: 'Your videos will be public. Supported formats:',
    browse: 'Select Files',
    videoTitle: 'Title',
    description: 'Description',
    thumbnail: 'Thumbnail',
    visibility: 'Visibility',
    public: 'Public',
    private: 'Private',
    privateDesc: 'Only you can see',
    membersOnly: 'Members Only',
    membersOnlyOption: 'Members only',
    membersOnlyDesc: 'Restrict to members',
    uploadFee: 'Upload fee',
    publish: 'Publish',
    uploading: 'Uploading your video',
    processing: 'Processing...',
    success: 'Upload Complete!',
    connectWalletDesc: "You'll need to connect your Kaspa wallet to upload videos and start earning.",
    createChannelDesc: 'Set up your creator channel to start uploading videos.',
    channelName: 'Channel Name',
    channelHandle: 'Channel Handle',
    clickToUploadCustom: 'Click to upload custom',
    randomFrame: 'Random frame',
    videoPrice: 'Video Price (KAS)',
    videoPriceDesc: 'Set a price viewers must pay to watch this video. Leave at 0 for free.',
    minPriceNote: 'Minimum 0.11 KAS (due to network fees) or free',
    earningsStructure: 'Earnings Structure',
    viewPayments: 'Views: 0.095 KAS per view goes to you',
    subscriptionEarnings: 'Subscriptions: 0.5 KAS per new subscriber',
    tipsAndMemberships: 'Tips & Memberships: Keep 100% of tips and membership payments',
    oneTimeFee: 'One-time upload fee',
    handleHint: 'This will be your unique @handle. Letters, numbers, and underscores only.',
    loadingDuration: 'Loading...',
    uploadThumbnail: 'Upload thumbnail',
    autoGeneratedOrCustom: 'Auto-generated or upload custom',
    titlePlaceholder: 'Add a title that describes your video',
    descriptionPlaceholder: 'Tell viewers about your video',
    fileSizeUnder1GB: 'Under 1GB',
    fileSizeOver5GB: 'Over 5GB',
    fileSize1to5GB: '1GB - 5GB',
    insufficientBalanceAmount: 'Insufficient balance. You have',
    percentComplete: 'complete',
    invalidFileType: 'Invalid file type',
    fileTooLarge: 'File too large',
    // Draft recovery
    resumePreviousUpload: 'Resume Previous Upload',
    restoreDraft: 'Restore',
    discardDraft: 'Discard',
    unsavedDraft: 'You have an unsaved draft from',
    // Channel creation
    channelCreatedSuccess: 'Channel created successfully!',
    handleLettersOnly: 'Handle can only contain letters, numbers, and underscores',
    handleMinLength: 'Handle must be at least 3 characters',
    selectSameFile: 'Please select the same video file',
    // Thumbnail
    generatingThumbnail: 'Generating thumbnail...',
    thumbnailGenerated: 'Thumbnail generated!',
    regeneratingThumbnail: 'Regenerating thumbnail...',
    newThumbnailGenerated: 'New thumbnail generated!',
    failedGenerateThumbnail: 'Failed to generate thumbnail',
    failedLoadVideo: 'Failed to load video',
    removeVideo: 'Remove video',
  },
  channel: {
    subscribers: 'subscribers',
    videos: 'Videos',
    membership: 'Membership',
    about: 'About',
    joined: 'Joined',
    totalViews: 'Total views',
    noVideos: 'No videos yet',
    editChannel: 'Edit Channel',
    createChannel: 'Create Channel',
    myVideos: 'My Videos',
    liked: 'Liked',
    kasEarnedTotal: 'KAS earned total',
    noDescription: 'No description yet',
    // Edit channel strings
    channelName: 'Channel Name',
    yourChannelName: 'Your channel name',
    handle: 'Handle',
    handleDesc: 'Letters, numbers, and underscores only',
    description: 'Description',
    descriptionHint: 'Shown below your subscriber count',
    aboutSection: 'About',
    aboutHint: 'Shown in the About tab',
    avatar: 'Avatar',
    uploadAvatar: 'Upload Avatar',
    uploading: 'Uploading...',
    banner: 'Banner',
    uploadBanner: 'Upload Banner',
    bannerHint: 'PNG, JPG, or WebP. Max 10MB. Recommended 1920x400.',
    avatarHint: 'PNG, JPG, or WebP. Max 5MB.',
    channelLinks: 'Channel Links',
    linksDesc: 'Add links to your social media, website, or other platforms.',
    linkTitle: 'Title',
    linkUrl: 'URL',
    addLink: 'Add',
    yourWallet: 'Your Wallet',
    notificationsEnabled: 'Notifications enabled',
    notificationsDisabled: 'Notifications disabled',
    getNotified: 'Get notified of new uploads',
    linkCopied: 'Link copied to clipboard!',
    creatorNoDescription: 'This creator hasn\'t added a description yet.',
    stats: 'Stats',
    kasEarned: 'KAS Earned',
    createMembershipTier: 'Create Membership Tier',
    tierName: 'Tier Name',
    tierPrice: 'Price (KAS)',
    tierDescription: 'Description',
    tierBenefits: 'Benefits (one per line)',
    membershipExpired: 'membership expired',
    membershipActive: 'member!',
    expiredOn: 'Expired on',
    expiresOn: 'Expires',
    accessUntil: 'Access until',
    renewAccess: 'Renew Access',
    renewMembership: 'Renew Membership',
    renewToKeepAccess: 'renew to keep access',
    active: 'Active',
    upgrade: 'Upgrade',
    purchase: 'Purchase',
    processing: 'Processing...',
    links: 'Links',
    addNewLink: 'Add New Link',
    manageLinks: 'Manage existing links:',
    manageVideos: 'Manage all your videos including private and processing ones',
    insufficientBalance: 'Insufficient balance for this action',
  },
  settings: {
    title: 'Settings',
    account: 'Account',
    security: 'Security',
    wallet: 'Wallet',
    referrals: 'Referrals',
    memberships: 'Memberships',
    rules: 'Rules',
    about: 'About',
    appearance: 'Appearance',
    appearanceDesc: 'Choose how KasShi looks for you',
    language: 'Language',
    theme: 'Theme',
    lightMode: 'Light',
    darkMode: 'Dark',
    systemMode: 'System',
    kaspaTheme: 'Kaspa',
    kaspaThemeDesc: 'Teal-accented dark theme with Kaspa vibes',
    darkTheme: 'Dark',
    darkThemeDesc: 'Pure dark mode for low-light environments',
    lightTheme: 'Light',
    lightThemeDesc: 'Clean light theme with Kaspa accent colors',
    signOut: 'Sign Out',
    deleteAccount: 'Delete Account',
    withdraw: 'Withdraw',
    withdrawAddress: 'Recipient Address',
    withdrawAmount: 'Amount (KAS)',
    withdrawAll: 'Withdraw All',
    depositKas: 'Deposit KAS',
    scanQr: 'Scan the QR code or copy the address below',
    copyAddress: 'Copy Address',
    addressCopied: 'Address copied!',
    utxoManagement: 'UTXO Management',
    consolidateWallet: 'Consolidate Wallet',
    consolidating: 'Consolidating...',
    twoFactorAuth: '2FA Authentication',
    enable2fa: 'Enable 2FA',
    disable2fa: 'Disable 2FA',
    transactionPassword: 'Transaction Password',
    enablePassword: 'Enable Password',
    disablePassword: 'Disable Password',
    recoveryPhrase: 'Recovery Phrase',
    viewRecoveryPhrase: 'View Recovery Phrase',
    copied: 'Copied!',
    userId: 'User ID',
    channelInfo: 'Channel Info',
    createChannel: 'Create Channel',
    noChannel: 'No channel created',
    pendingBalance: 'Pending Balance',
    settleNow: 'Settle Now',
    settling: 'Settling...',
    activeMemberships: 'Active Memberships',
    noMemberships: 'No active memberships',
    expiresOn: 'Expires on',
    referralProgram: 'Referral Program',
    yourReferralCode: 'Your Referral Code',
    shareCode: 'Share this code with friends',
    referralStats: 'Referral Stats',
    totalReferred: 'Total Referred',
    pendingRewards: 'Pending Rewards',
    // Additional settings strings
    yourMemberships: 'Your Memberships',
    active: 'active',
    expiresDate: 'Expires',
    totalPaid: 'Total paid',
    inviteFriends: 'Invite Friends',
    earnPerReferral: 'Earn 100 KAS per successful referral',
    referralRewards: 'Referral Rewards',
    youGet: 'You get',
    friendGets: 'Friend gets',
    eligibilityRequirements: 'Eligibility Requirements',
    accountAge: 'Account age',
    publishedVideos: 'Published videos',
    yourReferralLink: 'Your Referral Link',
    totalReferrals: 'Total Referrals',
    thisWeek: 'This Week',
    kasEarned: 'KAS Earned',
    yourReferrals: 'Your Referrals',
    inProgress: 'In Progress',
    paid: 'Paid',
    pending: 'Pending',
    rejected: 'Rejected',
    generateReferralLink: 'Generate Referral Link',
    creating: 'Creating...',
    createChannelToRefer: 'Create a channel to access the referral program',
    signInToAccessReferrals: 'Sign in to access referrals',
    referralLimits: 'Limits: Max 2 referrals per week, 10 total. Friend must upload 3 videos (30+ sec), watch 10 videos from 5+ channels, and wait 7 days before payout.',
    communityGuidelines: 'Community Guidelines',
    whatYouNeedToKnow: 'What you need to know before posting',
    freeSpeech: 'Free Speech is Encouraged',
    freeSpeechDesc: 'Everyone has a voice on KasShi. We believe in open discourse and the free exchange of ideas. Share your thoughts, express your creativity, and engage in meaningful conversations. Your perspective matters.',
    coreValue: 'Core Value',
    prohibitedContent: 'Prohibited Content',
    notAllowed: 'The following content is strictly not allowed',
    uploadVideos: 'Upload Videos',
    watchVideos: 'Watch Videos',
    differentChannels: 'Different Channels',
    waitingPeriod: 'Waiting Period',
    daysRemaining: 'days remaining',
    requirementsMet: 'Requirements met!',
    awaitingPayout: 'Awaiting admin approval',
    rewardClaimed: 'Reward claimed!',
    signInToManageSecurity: 'Sign in to manage security settings',
    externalWalletSecurity: 'External Wallet Security',
    externalWalletNotice: 'Your wallet security is managed by your external wallet (KasWare). Transaction passwords, 2FA, and recovery phrases are not applicable for external wallets.',
    currentPassword: 'Current password',
    viewRecoveryPhraseBtn: 'View recovery phrase',
    forgotPassword: 'Forgot password?',
    passwordRecoveryPhrase: 'Password Recovery Phrase',
    enterRecoveryPhrase: 'Enter recovery phrase to reset',
    newPasswordPlaceholder: 'New password (8+ characters)',
    reset: 'Reset',
    view: 'View',
    disable: 'Disable',
    // Security section
    twoFactorAuthDesc: '6-digit codes from authenticator app',
    twoFactorAuthHint: 'Adds 6-digit codes from an authenticator app for large transactions.',
    codeCopied: 'Code copied!',
    enterSixDigitCode: 'Enter 6-digit code',
    verifyAndEnable: 'Verify & Enable',
    enterCodeToDisable: 'Enter 2FA code to disable:',
    walletRecoveryPhrase: 'Wallet Recovery Phrase',
    walletMasterKey: 'Your Kaspa wallet\'s master key',
    backedUp: 'Backed Up',
    twentyFourWords: '24 words that control your KAS funds. Keep them secret!',
    transactionPasswordPlaceholder: 'Transaction password',
    neverShare: 'Never share with anyone',
    hide: 'Hide',
    optionalSecurity: 'Optional extra security layer',
    protectsLargeTransactions: 'Protects large transactions. Small actions stay frictionless.',
    setTransactionPassword: 'Set Transaction Password',
    confirmPassword: 'Confirm password',
    requireOnLargeTransactions: 'Require on larger KAS transactions',
    requireOnLogin: 'Require on login',
    enterPasswordToView: 'Enter password to view recovery phrase:',
    enterPasswordToDisable: 'Enter password to disable:',
    orEnterManually: 'Or enter manually:',
    sixDigitCode: '6-digit code',
    enabled: 'Enabled',
    // Memberships section
    kasPerMonth: 'KAS/month',
    noActiveMemberships: 'No active memberships',
    joinMembershipsDesc: 'Join channel memberships to access exclusive content',
    // Referrals section
    yourReferralReward: 'Your Referral Reward',
    referredBy: 'Referred by',
    youReceived: 'You received',
    paidOn: 'Paid on',
    completeTasksToEarn: 'Complete these tasks to earn',
    daysLeft: 'days left',
    videosRule: 'Videos must be 30+ seconds. You cannot watch your own videos or your referrer\'s videos.',
    videoCount: 'videos',
    watchCount: 'watches',
    meetsRequirements: 'Requirements met! Awaiting admin approval.',
    youWillReceive: 'You\'ll receive',
    onceApproved: 'KAS once approved.',
    tryAgain: 'Try again',
    // Rules section
    guidelinesIntro: 'KasShi is built on the principle that everyone deserves a platform to share their voice. These guidelines ensure our community remains a safe and respectful space for all creators and viewers.',
    hypersexualContent: 'Hypersexual Content',
    hypersexualDesc: 'Pornographic material, explicit sexual content, or any form of hypersexualized media is strictly prohibited. This includes nudity intended to sexually gratify.',
    violenceAbuse: 'Violence & Abuse',
    violenceDesc: 'Content depicting murder, torture, abuse, or rape is absolutely not permitted. This includes graphic violence, harmful acts against individuals or animals, and any content that glorifies or promotes such behavior.',
    legalNotices: 'Legal Notices & Copyright',
    important: 'Important',
    legalDesc: 'Videos are subject to removal in response to valid legal notices, including copyright infringement claims. We comply with applicable laws and will remove content when legally required to do so.',
    rulesFooter: 'Violations of these guidelines may result in content removal and account suspension. Help us keep KasShi safe by reporting content that breaks these rules.',
    // About section
    howKasshiWorks: 'How does KasShi work?',
    everyInteraction: 'Every interaction has real value through Kaspa micropayments.',
    watchVideosDesc: '0.11-0.25 KAS based on length. 95% to creator.',
    uploadVideosDesc: '5-15 KAS based on file size.',
    subscribe: 'Subscribe',
    subscribeDesc: '0.5 KAS, 100% to creator.',
    engagement: 'Engagement',
    engagementDesc: 'Likes, comments, dislikes: 0.02 KAS to platform.',
    kaspaConfirms: 'confirms in seconds.',
    learnMore: 'Learn more →',
    legalAndPolicies: 'Legal & Policies',
    privacyTermsMore: 'Privacy Policy, Terms & More',
    viewAllLegal: 'View all legal documents',
    openSource: 'Open Source',
    viewOnGitHub: 'View on GitHub',
    // Wallet section - additional
    signedInAs: 'Signed in as',
    logOut: 'Log Out',
    copy: 'Copy',
    walletLabel: 'Wallet',
    pendingKas: 'pending',
    balanceBreakdownDesc: 'Small transactions are batched off-chain to save fees. This is why your balance here may differ from Kaspa explorers.',
    batchThresholdDesc: 'Small fees are batched until 0.11 KAS threshold.',
    toThreshold: 'to threshold',
    adminDashboard: 'Admin Dashboard',
    adminDashboardDesc: 'Manage reports, moderate content',
    walletModeAdmin: 'Wallet Mode (Admin)',
    walletModeDesc: 'Demo for testing, Mainnet for real',
    demo: 'Demo',
    mainnet: 'Mainnet',
    demoLabel: 'DEMO',
    mainnetLabel: 'MAINNET',
    walletNeedsConsolidation: 'Wallet Needs Consolidation',
    consolidationNeeded: 'Your wallet has too many small transactions. Consolidate before withdrawing.',
    utxoManagementDesc: 'Combine small UTXOs into larger ones to reduce transaction fees and avoid mass limits.',
    walletUtxos: 'Wallet UTXOs',
    destinationAddress: 'Destination Address',
    max: 'MAX',
    sendKas: 'Send KAS',
    signInToAccessWallet: 'Sign in to access your wallet',
    goToHome: 'Go to Home',
    amountKas: 'Amount (KAS)',
    twoFactorManagedByKasWare: 'Your two-factor authentication is managed by KasWare',
    recoveryManagedByKasWare: 'Your wallet recovery phrase is managed by KasWare',
  },
  notifications: {
    title: 'Notifications',
    markAllRead: 'Mark all as read',
    clearAll: 'Clear all',
    noNotifications: 'No notifications yet',
    transactionUpdatesHere: "You'll see transaction updates here",
    justNow: 'Just now',
  },
  leaderboard: {
    title: 'Leaderboard',
    musicArtists: 'Music Artists',
    podcasters: 'Podcasters',
    totalPlays: 'Total Plays',
    tracks: 'tracks',
    podcasts: 'podcasts',
    episodes: 'episodes',
    noArtists: 'No artists on the leaderboard yet',
    noPodcasters: 'No podcasters on the leaderboard yet',
    plays: 'plays',
  },
  activity: {
    title: 'Account Activity',
    subtitle: 'See who interacted with your channel',
    subscribers: 'Subscribers',
    likes: 'Likes',
    comments: 'Comments',
    subscribed: 'subscribed to your channel',
    likedYourVideo: 'liked your video',
    noSubscribers: 'No subscribers yet',
    noSubscribersDesc: 'When people subscribe to your channel, they will appear here',
    noLikes: 'No likes yet',
    noLikesDesc: 'When people like your videos, they will appear here',
    noComments: 'No comments yet',
    noCommentsDesc: 'When people comment on your videos, they will appear here',
    on: 'on',
  },
  common: {
    loading: 'Loading...',
    error: 'Something went wrong',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    close: 'Close',
    search: 'Search',
    noResults: 'No results found',
    seeMore: 'See more',
    seeLess: 'See less',
    processing: 'Processing Payment',
    or: 'OR',
    sending: 'Sending...',
    leaderboard: 'Top Channels',
    featuredChannels: 'Featured Channels',
    noChannels: 'No channels yet',
  },
  time: {
    now: 'just now',
    recently: 'recently',
    minute: 'minute',
    minutes: 'minutes',
    hour: 'hour',
    hours: 'hours',
    day: 'day',
    days: 'days',
    week: 'week',
    weeks: 'weeks',
    month: 'month',
    months: 'months',
    year: 'year',
    years: 'years',
    ago: 'ago',
    agoFormat: '{n} {unit} ago',
  },
  search: {
    searchResultsFor: 'Search results for',
    resultsFound: 'results found',
    resultFound: 'result found',
    searching: 'Searching...',
    all: 'All',
    videos: 'Videos',
    channels: 'Channels',
    noResultsFound: 'No results found',
    tryDifferentKeywords: 'Try different keywords or check your spelling',
    searchKasshi: 'Search KasShi',
    findVideosAndChannels: 'Find videos and channels',
    subscribers: 'subscribers',
  },
  footer: {
    privacy: 'Privacy',
    terms: 'Terms',
    dmca: 'DMCA',
    kaspa: 'Kaspa',
    riskWarning: 'Cryptocurrency involves significant risk. All transactions are final. Not financial advice. 18+ only.',
  },
};

// Import other translations
import { es } from '@/react-app/i18n/es';
import { fr } from '@/react-app/i18n/fr';
import { de } from '@/react-app/i18n/de';
import { pt } from '@/react-app/i18n/pt';
import { zh } from '@/react-app/i18n/zh';
import { ja } from '@/react-app/i18n/ja';
import { ko } from '@/react-app/i18n/ko';
import { ru } from '@/react-app/i18n/ru';
import { ar } from '@/react-app/i18n/ar';
import { hi } from '@/react-app/i18n/hi';
import { it } from '@/react-app/i18n/it';
import { tr } from '@/react-app/i18n/tr';
import { nl } from '@/react-app/i18n/nl';
import { pl } from '@/react-app/i18n/pl';
import { vi } from '@/react-app/i18n/vi';
import { th } from '@/react-app/i18n/th';
import { id } from '@/react-app/i18n/id';

const translations: Record<Language, Translations> = {
  en, es, fr, de, pt, it, ru, zh, ja, ko, ar, hi, tr, nl, pl, vi, th, id
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

// Valid language codes for URL detection
const validLangCodes = languages.map(l => l.code);

function getLanguageFromUrl(): Language | null {
  const pathname = window.location.pathname;
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0]?.toLowerCase();
  
  if (firstSegment && validLangCodes.includes(firstSegment as Language)) {
    return firstSegment as Language;
  }
  return null;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    // Priority: 1. URL path, 2. localStorage, 3. Browser language, 4. English
    const urlLang = getLanguageFromUrl();
    if (urlLang) {
      return urlLang;
    }
    
    const stored = localStorage.getItem('kasshi_language');
    if (stored && translations[stored as Language]) {
      return stored as Language;
    }
    // Try to detect browser language
    const browserLang = navigator.language.split('-')[0] as Language;
    if (translations[browserLang]) {
      return browserLang;
    }
    return 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('kasshi_language', lang);
    // Set document direction for RTL languages
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  };

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  const value: LanguageContextType = {
    language,
    setLanguage,
    t: translations[language] || en,
    isRTL: language === 'ar',
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// Export for direct access if needed
export { en as defaultTranslations };
