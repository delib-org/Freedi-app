#!/bin/bash

# Analyze Firebase emulator function calls
# Usage: tail -f firebase-debug.log | ./analyze-functions.sh

echo "=== Firebase Functions Analysis ==="
echo "Started at: $(date)"
echo ""

awk '
BEGIN {
    print "Timestamp                | Function Name                                  | Duration    | Status"
    print "------------------------|------------------------------------------------|-------------|--------"
}

/Beginning execution of/ {
    match($0, /"([^"]+)"/, func)
    gsub(/^i  functions: Beginning execution of /, "", $0)
    start_time = substr($0, 1, 8)
    function_name = func[1]
    start[function_name] = start_time
    next
}

/Finished.*in/ {
    match($0, /"([^"]+)"/, func)
    match($0, /in ([0-9.]+)/, duration)
    function_name = func[1]
    dur = duration[1]

    if (function_name in start) {
        printf "%s | %-46s | %10s | ✓\n", start[function_name], function_name, dur
        delete start[function_name]
    }
}

/Error:.*updateNumberOfMembers/ {
    printf "%s | %-46s | %10s | ✗ ERROR\n", substr($0, 1, 8), "me-west1-updateNumberOfMembers", "N/A"
}
'
