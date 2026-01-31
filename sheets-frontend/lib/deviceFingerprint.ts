// lib/deviceFingerprint.ts
import FingerprintJS from '@fingerprintjs/fingerprintjs';

export interface DeviceInfo {
  id: string;
  name: string;
  browser: string;
  os: string;
  device: string;
  screen: string;
  timezone: string;
}

let fpPromise: Promise<any> | null = null;

const initFingerprint = () => {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load();
  }
  return fpPromise;
};

// Native browser detection - no ua-parser-js needed
const getBrowserInfo = (): { name: string; version: string } => {
  const ua = navigator.userAgent;
  
  if (ua.includes('Firefox/')) {
    const version = ua.split('Firefox/')[1]?.split(' ')[0] || '';
    return { name: 'Firefox', version };
  }
  if (ua.includes('Edg/')) {
    const version = ua.split('Edg/')[1]?.split(' ')[0] || '';
    return { name: 'Edge', version };
  }
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    const version = ua.split('Chrome/')[1]?.split(' ')[0] || '';
    return { name: 'Chrome', version };
  }
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    const version = ua.split('Version/')[1]?.split(' ')[0] || '';
    return { name: 'Safari', version };
  }
  
  return { name: 'Unknown Browser', version: '' };
};

const getOSInfo = (): { name: string; version: string } => {
  const ua = navigator.userAgent;
  
  if (ua.includes('Windows NT 10.0')) return { name: 'Windows', version: '10/11' };
  if (ua.includes('Windows NT 6.3')) return { name: 'Windows', version: '8.1' };
  if (ua.includes('Windows NT 6.2')) return { name: 'Windows', version: '8' };
  if (ua.includes('Windows NT 6.1')) return { name: 'Windows', version: '7' };
  
  if (ua.includes('Mac OS X')) {
    const version = ua.split('Mac OS X ')[1]?.split(')')[0]?.replace(/_/g, '.') || '';
    return { name: 'macOS', version };
  }
  
  if (ua.includes('Android')) {
    const version = ua.split('Android ')[1]?.split(';')[0] || '';
    return { name: 'Android', version };
  }
  
  if (ua.includes('iPhone') || ua.includes('iPad')) {
    const version = ua.split('OS ')[1]?.split(' ')[0]?.replace(/_/g, '.') || '';
    return { name: 'iOS', version };
  }
  
  if (ua.includes('Linux')) return { name: 'Linux', version: '' };
  
  return { name: 'Unknown OS', version: '' };
};

const getDeviceType = (): string => {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'Tablet';
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle/.test(ua)) return 'Mobile';
  return 'Desktop';
};

export const getDeviceFingerprint = async (): Promise<DeviceInfo> => {
  try {
    console.log('🔍 Starting device fingerprint collection...');
    
    // Get fingerprint ID
    const fp = await initFingerprint();
    const result = await fp.get();
    const visitorId = result.visitorId;
    console.log('✅ Visitor ID:', visitorId);

    // Get device info using native detection
    const browser = getBrowserInfo();
    const os = getOSInfo();
    const deviceType = getDeviceType();
    const screen = `${window.screen.width}x${window.screen.height}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const deviceInfo = {
      id: visitorId,
      name: `${browser.name} on ${os.name}`,
      browser: `${browser.name} ${browser.version}`.trim(),
      os: `${os.name} ${os.version}`.trim(),
      device: deviceType,
      screen,
      timezone,
    };

    console.log('✅ Device fingerprint collected:', deviceInfo);
    return deviceInfo;
  } catch (error) {
    console.error('❌ Error getting device fingerprint:', error);
    return {
      id: 'unknown',
      name: 'Unknown Device',
      browser: 'Unknown',
      os: 'Unknown',
      device: 'Unknown',
      screen: 'Unknown',
      timezone: 'Unknown',
    };
  }
};

export const isFingerprintingSupported = (): boolean => {
  return typeof window !== 'undefined' && 
         typeof window.screen !== 'undefined';
};
