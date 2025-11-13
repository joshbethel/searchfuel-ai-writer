/**
 * Enhanced URL validation utility to prevent Server-Side Request Forgery (SSRF) attacks
 * 
 * This module provides comprehensive URL validation including:
 * - DNS resolution to verify actual IP addresses
 * - Private IP range detection (IPv4 and IPv6)
 * - Metadata service endpoint blocking
 * - URL encoding/obfuscation detection
 * - Protocol whitelisting
 */

/**
 * Check if an IP address is in a private or reserved range
 * Comprehensive coverage of all RFC 1918 and special-use addresses
 */
function isPrivateIP(ip: string): boolean {
  // Normalize IP address
  const normalizedIP = ip.toLowerCase().trim();
  
  // IPv4 private ranges (RFC 1918)
  const ipv4PrivateRanges = [
    /^127\./,                    // 127.0.0.0/8 - Loopback
    /^10\./,                     // 10.0.0.0/8 - Private
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 - Private
    /^192\.168\./,               // 192.168.0.0/16 - Private
    /^169\.254\./,               // 169.254.0.0/16 - Link-local (APIPA)
    /^0\.0\.0\.0$/,              // Invalid/unspecified
    /^255\.255\.255\.255$/,      // Broadcast
    /^224\./,                    // 224.0.0.0/4 - Multicast
    /^240\./,                    // 240.0.0.0/4 - Reserved
  ];

  // Check IPv4 private ranges
  if (ipv4PrivateRanges.some(range => range.test(normalizedIP))) {
    return true;
  }

  // IPv6 private/local ranges (RFC 4193, RFC 4291)
  const ipv6PrivateRanges = [
    /^::1$/,                     // IPv6 loopback
    /^::ffff:127\./,             // IPv4-mapped IPv6 loopback
    /^fc00:/,                    // fc00::/7 - Unique Local Address (ULA)
    /^fd00:/,                    // fd00::/8 - ULA (part of fc00::/7)
    /^fe80:/,                    // fe80::/10 - Link-local
    /^ff00:/,                    // ff00::/8 - Multicast
    /^::$/,                      // Unspecified
    /^2001:db8:/,                // 2001:db8::/32 - Documentation
    /^2001:10:/,                 // 2001:10::/28 - ORCHID
    /^2002:/,                    // 2002::/16 - 6to4
  ];

  if (ipv6PrivateRanges.some(range => range.test(normalizedIP))) {
    return true;
  }

  return false;
}

/**
 * Resolve hostname to IP addresses using DNS
 * This is critical for detecting DNS rebinding attacks
 */
async function resolveHostname(hostname: string): Promise<string[]> {
  try {
    // Use Deno's DNS resolution
    const resolver = await Deno.resolveDns(hostname, "A");
    return resolver.map(ip => ip.toString());
  } catch (error) {
    // If A record fails, try AAAA (IPv6)
    try {
      const resolver = await Deno.resolveDns(hostname, "AAAA");
      return resolver.map(ip => ip.toString());
    } catch {
      // If both fail, return empty array
      return [];
    }
  }
}

/**
 * Check if hostname is a known localhost variation
 */
function isLocalhostHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().trim();
  
  const localhostPatterns = [
    'localhost',
    'localhost.localdomain',
    'localhost.local',
    'local',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '[::1]',
  ];

  return localhostPatterns.includes(normalized) || 
         normalized.startsWith('localhost.') ||
         normalized.endsWith('.localhost');
}

/**
 * Decode URL-encoded strings to detect obfuscation attempts
 */
function decodeUrlEncoding(url: string): string {
  try {
    // Decode common encoding attempts
    let decoded = url;
    
    // Handle multiple levels of encoding
    for (let i = 0; i < 5; i++) {
      const previous = decoded;
      decoded = decodeURIComponent(decoded);
      if (previous === decoded) break; // No more decoding possible
    }
    
    return decoded;
  } catch {
    return url; // If decoding fails, return original
  }
}

/**
 * Validate URL to prevent SSRF attacks with comprehensive checks
 * 
 * @param url - The URL to validate
 * @param options - Optional validation options
 * @returns Promise with isValid flag and error message if invalid
 */
export async function validateUrl(
  url: string, 
  options: { skipDnsResolution?: boolean } = {}
): Promise<{ isValid: boolean; error?: string }> {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL is required and must be a string' };
  }

  // Check for URL encoding obfuscation
  const decodedUrl = decodeUrlEncoding(url);
  if (decodedUrl !== url) {
    // If URL was encoded, validate the decoded version too
    const decodedValidation = await validateUrl(decodedUrl, { skipDnsResolution: true });
    if (!decodedValidation.isValid) {
      return { 
        isValid: false, 
        error: 'URL encoding detected and decoded URL is invalid: ' + decodedValidation.error 
      };
    }
  }

  let parsedUrl: URL;
  
  try {
    // Parse the URL (handles both encoded and decoded)
    parsedUrl = new URL(url);
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' };
  }

  // Only allow HTTP and HTTPS protocols
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { 
      isValid: false, 
      error: 'Only HTTP and HTTPS protocols are allowed' 
    };
  }

  // Check hostname
  const hostname = parsedUrl.hostname.toLowerCase().trim();
  
  // Block empty hostname
  if (!hostname) {
    return { isValid: false, error: 'URL must include a hostname' };
  }

  // Block localhost variations (before DNS resolution for speed)
  if (isLocalhostHostname(hostname)) {
    return { 
      isValid: false, 
      error: 'Localhost and loopback addresses are not allowed' 
    };
  }

  // Block common internal/private hostname patterns
  const privateHostnamePatterns = [
    /^10\./,                     // Private IP in hostname
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private IP range
    /^192\.168\./,               // Private IP range
    /^169\.254\./,               // Link-local
    /\.local$/i,                 // .local domains
    /\.internal$/i,              // .internal domains
    /\.lan$/i,                   // .lan domains
    /\.corp$/i,                  // .corp domains
    /\.home$/i,                  // .home domains
    /^localhost\./i,             // localhost.*
    /^127\./,                    // 127.x.x.x
    /^0\.0\.0\.0$/,              // Invalid
  ];

  if (privateHostnamePatterns.some(pattern => pattern.test(hostname))) {
    return { 
      isValid: false, 
      error: 'Private or internal network addresses are not allowed' 
    };
  }

  // Block metadata service endpoints (comprehensive list)
  const metadataEndpoints = [
    '169.254.169.254',           // AWS, GCP, Azure, DigitalOcean metadata
    'metadata.google.internal',  // GCP metadata
    'metadata.azure.com',         // Azure metadata
    '169.254.170.2',             // AWS ECS metadata
    '100.100.100.200',           // Alibaba Cloud metadata
    'metadata.tencentyun.com',   // Tencent Cloud metadata
  ];

  if (metadataEndpoints.some(endpoint => hostname.includes(endpoint))) {
    return { 
      isValid: false, 
      error: 'Cloud metadata service endpoints are not allowed' 
    };
  }

  // Check if hostname is already an IP address
  const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const isIPv6 = /^\[?([0-9a-f:]+)\]?$/i.test(hostname);
  
  if (isIPv4 || isIPv6) {
    // Extract IP from IPv6 bracket notation
    const ip = isIPv6 ? hostname.replace(/[\[\]]/g, '') : hostname;
    
    if (isPrivateIP(ip)) {
      return { 
        isValid: false, 
        error: 'Private IP addresses are not allowed' 
      };
    }
  } else if (!options.skipDnsResolution) {
    // Resolve hostname to IP addresses via DNS
    try {
      const resolvedIPs = await resolveHostname(hostname);
      
      if (resolvedIPs.length === 0) {
        return { 
          isValid: false, 
          error: 'Unable to resolve hostname' 
        };
      }

      // Check all resolved IPs (handles DNS rebinding attacks)
      for (const ip of resolvedIPs) {
        if (isPrivateIP(ip)) {
          console.warn(`SSRF attempt blocked: ${hostname} resolves to private IP ${ip}`);
          return { 
            isValid: false, 
            error: `Hostname resolves to private IP address: ${ip}` 
          };
        }
      }
    } catch (dnsError) {
      // If DNS resolution fails, be cautious and reject
      console.warn(`DNS resolution failed for ${hostname}:`, dnsError);
      return { 
        isValid: false, 
        error: 'DNS resolution failed. Unable to verify hostname.' 
      };
    }
  }

  // Additional security: Block dangerous protocols in the URL string
  const dangerousProtocols = [
    'file://',
    'ftp://',
    'gopher://',
    'ldap://',
    'ldaps://',
    'tftp://',
    'ssh://',
    'telnet://',
    'data:',
    'javascript:',
    'vbscript:',
  ];

  const lowerUrl = url.toLowerCase();
  if (dangerousProtocols.some(protocol => lowerUrl.includes(protocol))) {
    return { 
      isValid: false, 
      error: 'Dangerous protocols are not allowed' 
    };
  }

  // Block URLs with credentials in the URL (security risk)
  if (parsedUrl.username || parsedUrl.password) {
    return { 
      isValid: false, 
      error: 'URLs with embedded credentials are not allowed' 
    };
  }

  return { isValid: true };
}

/**
 * Synchronous version for cases where DNS resolution is not needed
 * Use this for initial validation, then use async version for final check
 */
export function validateUrlSync(url: string): { isValid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL is required and must be a string' };
  }

  let parsedUrl: URL;
  
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' };
  }

  // Only allow HTTP and HTTPS protocols
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { 
      isValid: false, 
      error: 'Only HTTP and HTTPS protocols are allowed' 
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase().trim();
  
  // Quick checks that don't require DNS
  if (isLocalhostHostname(hostname)) {
    return { 
      isValid: false, 
      error: 'Localhost and loopback addresses are not allowed' 
    };
  }

  // Check if it's a direct IP address
  const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  if (isIPv4 && isPrivateIP(hostname)) {
    return { 
      isValid: false, 
      error: 'Private IP addresses are not allowed' 
    };
  }

  return { isValid: true };
}

/**
 * Validate and sanitize URL for safe fetching (async with DNS resolution)
 * Throws an error if URL is invalid
 * 
 * @param url - The URL to validate
 * @returns Promise with the validated and normalized URL
 * @throws Error if URL is invalid
 */
export async function validateAndSanitizeUrl(url: string): Promise<string> {
  const validation = await validateUrl(url);
  
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid URL');
  }

  // Return the normalized URL
  const parsedUrl = new URL(url);
  return parsedUrl.toString();
}

