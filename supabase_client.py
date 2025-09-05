import os
from supabase import create_client, Client


def get_supabase_client() -> Client:
	url = os.getenv("SUPABASE_URL")
	key = os.getenv("SUPABASE_ANON_KEY")
	if not url or not key:
		raise RuntimeError("Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment")
	return create_client(url, key)


