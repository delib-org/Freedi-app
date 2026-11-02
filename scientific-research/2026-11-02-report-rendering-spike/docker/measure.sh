#!/bin/sh
# Runs inside the container: one command, then prints wall time and cgroup peak memory
# (cgroup peak includes /tmp tmpfs and page cache, like the Cloud Functions memory limit).
start=$(date +%s%N)
"$@"
end=$(date +%s%N)
echo "wall_ms=$(( (end-start)/1000000 )) cgroup_peak_MB=$(( $(cat /sys/fs/cgroup/memory.peak) / 1048576 ))"
