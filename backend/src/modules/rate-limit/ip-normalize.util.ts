// IPv4-mapped IPv6 addresses (e.g. "::ffff:172.19.0.1", already observed in
// this project's own live event data from Docker's bridge network) must
// normalize to their plain IPv4 form before being used as a rate-limit
// bucket key — otherwise a dual-stack client can end up with two
// independent buckets for what is really the same source, roughly
// doubling its effective rate limit. Consistent with express-ipaddr's own
// `::ffff:`-stripping used for req.ip resolution elsewhere in this project.
const IPV4_MAPPED_PREFIX = '::ffff:';

export function normalizeIp(ip: string): string {
  if (ip.toLowerCase().startsWith(IPV4_MAPPED_PREFIX)) {
    return ip.slice(IPV4_MAPPED_PREFIX.length);
  }
  return ip;
}
