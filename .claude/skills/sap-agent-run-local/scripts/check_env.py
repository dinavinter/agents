#!/usr/bin/env python3
"""Check environment variables configuration"""
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv('app/.env.local')

print("=" * 60)
print("Environment Variables Check")
print("=" * 60)

# Check required environment variables
required_vars = {
    'AI Core': [
        'AICORE_BASE_URL',
        'AICORE_CLIENT_ID',
        'AICORE_CLIENT_SECRET',
        'AICORE_AUTH_URL',
        'AICORE_RESOURCE_GROUP'
    ]
}

all_ok = True

for category, vars_list in required_vars.items():
    print(f"\n{category} Variables:")
    print("-" * 60)
    for var in vars_list:
        value = os.environ.get(var)
        if value:
            if 'SECRET' in var or 'TOKEN' in var:
                print(f"✓ {var}: {value[:20]}...")
            else:
                print(f"✓ {var}: {value}")
        else:
            print(f"✗ {var}: NOT SET")
            all_ok = False

if all_ok:
    print("\n" + "=" * 60)
    print("✓ All required variables are set!")
    print("=" * 60)
    sys.exit(0)
else:
    print("\n" + "=" * 60)
    print("✗ Some required variables are missing")
    print("=" * 60)
    sys.exit(1)
