export type DeviceCategory = 'mobile' | 'desktop' | 'tablet' | 'unknown';

export interface Peer {
  id: string;
  name: string;
  avatar: string;
  deviceType: DeviceCategory;
  roomCode: string;
  ip?: string;
  deviceId?: string; // persistent per-device id (survives refresh) for de-duplication
  isSelf?: boolean;
  signalStrength?: number; // 1 to 5
  wifiBand?: '5 GHz' | '2.4 GHz';
  distanceLevel?: number; // for radar visual (1, 2, 3)
}

export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'app' | 'other';

export interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  category: FileCategory;
  file?: File;
  previewUrl?: string;
  progress?: number;
  status?: 'pending' | 'transferring' | 'completed' | 'error';
}

export type TransferDirection = 'sending' | 'receiving';
export type TransferStatus = 
  | 'idle' 
  | 'requesting' 
  | 'waiting' 
  | 'transferring' 
  | 'paused' 
  | 'completed' 
  | 'cancelled' 
  | 'rejected' 
  | 'failed';

export interface ActiveTransferSession {
  sessionId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string;
  direction: TransferDirection;
  status: TransferStatus;
  files: FileItem[];
  currentFileIndex: number;
  transferredBytes: number;
  totalBytes: number;
  currentSpeedBytes: number;
  peakSpeedBytes: number;
  elapsedSeconds: number;
  etaSeconds: number;
  connectionType: 'WebRTC Direct P2P (Wi-Fi Local)' | 'Local Network Relay';
  completedBlobUrl?: string;
  completedFileName?: string;
  error?: string;
}

export interface HistoryRecord {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  category: FileCategory;
  direction: 'sent' | 'received';
  peerName: string;
  peerAvatar: string;
  timestamp: number;
  blobUrl?: string;
  blob?: Blob;
  speedMBs?: number;
}

export interface IncomingRequest {
  senderId: string;
  senderName: string;
  senderAvatar: string;
  files: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    category: FileCategory;
  }>;
  totalSize: number;
}
