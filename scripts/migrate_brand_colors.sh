#!/bin/bash
# Migrate emerald CTA/accent colors to PYC brand blue in view components.
# Semantic success colors (emerald-50/100/200/800 badges) are preserved.
set -e
cd /home/z/my-project/src/components/views

for f in *.tsx; do
  sed -i \
    -e 's/bg-emerald-600 hover:bg-emerald-700/bg-primary hover:bg-primary\/90/g' \
    -e 's/bg-emerald-500\/30 text-emerald-50/bg-white\/20 text-blue-50/g' \
    -e 's/from-emerald-700 via-emerald-600 to-teal-600/from-[#14257F] via-[#1D34A8] to-[#2C46B8]/g' \
    -e 's/border-emerald-400 bg-emerald-50\/50/border-primary\/60 bg-accent\/60/g' \
    -e 's/bg-emerald-50 border border-emerald-100 text-emerald-700 px-1.5 py-0.5 hover:bg-emerald-100/bg-accent border border-primary\/20 text-primary px-1.5 py-0.5 hover:bg-primary\/10/g' \
    -e 's/bg-emerald-600 text-white border-emerald-600/bg-primary text-white border-primary/g' \
    -e 's/hover:bg-emerald-700/hover:bg-primary\/90/g' \
    -e 's/bg-emerald-600/bg-primary/g' \
    -e 's/bg-emerald-700/bg-primary/g' \
    -e 's/hover:text-emerald-700/hover:text-primary/g' \
    -e 's/group-hover:text-emerald-700/group-hover:text-primary/g' \
    -e 's/text-emerald-700/text-primary/g' \
    -e 's/text-emerald-600/text-primary/g' \
    -e 's/border-emerald-600/border-primary/g' \
    -e 's/bg-emerald-950/bg-[#0E1A62]/g' \
    -e 's/text-emerald-50/text-blue-50/g' \
    -e 's/text-emerald-100/text-blue-100/g' \
    -e 's/hover:bg-emerald-50\/30/hover:bg-accent\/50/g' \
    -e 's/hover:bg-emerald-50\/40/hover:bg-accent\/50/g' \
    -e 's/hover:border-emerald-200/hover:border-primary\/30/g' \
    -e 's/hover:border-emerald-300/hover:border-primary\/40/g' \
    "$f"
done
echo "=== remaining emerald usage (should be semantic success colors only) ==="
grep -rhoE '(hover:)?(bg|text|border|ring|from|to|via)-emerald-[0-9]+(/[0-9]+)?' . | sort | uniq -c | sort -rn
