import { describe, expect, it } from 'vitest';

import {
  calculateCpuUsagePercent,
  parseDarwinNetworkUsage,
  parseLinuxNetworkUsage,
  parsePosixDiskUsage,
  parseWindowsNetworkUsage,
  parseWindowsDiskUsage,
} from './systemMetrics';

describe('system metrics', () => {
  it('calculates busy CPU percentage from two aggregate samples', () => {
    expect(calculateCpuUsagePercent(
      { idle: 1_000, total: 2_000 },
      { idle: 1_250, total: 3_000 },
    )).toBe(75);
    expect(calculateCpuUsagePercent(
      { idle: 10, total: 10 },
      { idle: 10, total: 10 },
    )).toBe(0);
  });

  it('parses POSIX df output and removes virtual or duplicate mounts', () => {
    const disks = parsePosixDiskUsage(`Filesystem 1024-blocks Used Available Capacity Mounted on
/dev/nvme0n1p2 1000 600 400 60% /
tmpfs 200 5 195 3% /run
/dev/nvme0n1p2 1000 600 400 60% /rootfs
/dev/sdb1 2000 250 1750 13% /mnt/data drive`);

    expect(disks).toEqual([
      { name: '/dev/nvme0n1p2', mountPoint: '/', totalBytes: 1_024_000, usedBytes: 614_400, availableBytes: 409_600, usagePercent: 60 },
      { name: '/dev/sdb1', mountPoint: '/mnt/data drive', totalBytes: 2_048_000, usedBytes: 256_000, availableBytes: 1_792_000, usagePercent: 12.5 },
    ]);
  });

  it('parses fixed Windows drives from PowerShell JSON', () => {
    expect(parseWindowsDiskUsage(JSON.stringify([
      { DeviceID: 'C:', Size: '1000', FreeSpace: '250' },
      { DeviceID: 'D:', Size: 2000, FreeSpace: 1500 },
    ]))).toEqual([
      { name: 'C:', mountPoint: 'C:\\', totalBytes: 1000, usedBytes: 750, availableBytes: 250, usagePercent: 75 },
      { name: 'D:', mountPoint: 'D:\\', totalBytes: 2000, usedBytes: 500, availableBytes: 1500, usagePercent: 25 },
    ]);
  });

  it('sums non-loopback Linux network counters', () => {
    expect(parseLinuxNetworkUsage(`Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 1000 10 0 0 0 0 0 0 1000 10 0 0 0 0 0 0
  eth0: 9000 90 0 0 0 0 0 0 3000 30 0 0 0 0 0 0
 wlan0: 4000 40 0 0 0 0 0 0 2000 20 0 0 0 0 0 0`)).toEqual({
      receivedBytes: 13_000,
      sentBytes: 5_000,
    });
  });

  it('deduplicates macOS interface rows before summing network counters', () => {
    expect(parseDarwinNetworkUsage(`Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
lo0 16384 <Link#1> 00:00:00:00:00:00 10 0 1000 10 0 1000 0
en0 1500 <Link#4> aa:bb:cc:dd:ee:ff 20 0 9000 12 0 3000 0
en0 1500 192.168.1 192.168.1.20 20 - 9000 12 - 3000 -
en1 1500 <Link#5> 11:22:33:44:55:66 8 0 4000 4 0 2000 0`)).toEqual({
      receivedBytes: 13_000,
      sentBytes: 5_000,
    });
  });

  it('sums Windows adapter counters from PowerShell JSON', () => {
    expect(parseWindowsNetworkUsage(JSON.stringify([
      { Name: 'Ethernet', ReceivedBytes: '9000', SentBytes: '3000' },
      { Name: 'Wi-Fi', ReceivedBytes: 4000, SentBytes: 2000 },
    ]))).toEqual({ receivedBytes: 13_000, sentBytes: 5_000 });
  });
});
