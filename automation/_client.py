"""Shared Supabase client + config for the PulseShop automation scripts."""
from __future__ import annotations

import os
import sys

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

MEDIA_BUCKET = "media"


def get_client() -> Client:
    """Create a service-role Supabase client from the environment.

    Exits with a helpful message if the config is missing.
    """
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit(
            "Missing SUPABASE_URL / SUPABASE_SERVICE_KEY. "
            "Copy automation/.env.example to automation/.env and fill it in."
        )
    return create_client(url, key)
