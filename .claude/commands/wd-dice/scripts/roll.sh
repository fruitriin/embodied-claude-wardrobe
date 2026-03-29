#!/bin/bash
# Roll a dice: randomly pick one from given arguments
# Usage: roll.sh choice1 choice2 [choice3 ...]

if [ $# -lt 2 ]; then
  echo "Error: At least 2 choices required" >&2
  exit 1
fi

index=$(( RANDOM % $# + 1 ))
eval echo "\${$index}"
