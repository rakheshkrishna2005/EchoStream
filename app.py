import os
import uuid
import requests
import streamlit as st
from urllib.parse import urlparse
from dotenv import load_dotenv
from supabase_client import get_supabase_client

load_dotenv()

# Configure page
st.set_page_config(
    page_title=" AI",
    page_icon="🎬",
    layout="wide",
    initial_sidebar_state="auto"
)

API_BASE_URL = os.getenv("API_BASE_URL")
API_TOKEN = os.getenv("API_BEARER_TOKEN")

HEADERS = {"Authorization": f"Bearer {API_TOKEN}"} if API_TOKEN else {}

DASHBOARD = "dashboard"
DETAIL = "detail"
RESULTS = "results"


def ensure_state():
	if "media" not in st.session_state:
		st.session_state.media = []
	if "view" not in st.session_state:
		st.session_state.view = DASHBOARD
	if "active_media_id" not in st.session_state:
		st.session_state.active_media_id = None
	if "show_new" not in st.session_state:
		st.session_state.show_new = False
	if "loaded_from_db" not in st.session_state:
		st.session_state.loaded_from_db = False


def get_media_by_id(media_id: str):
	for m in st.session_state.media:
		if m["id"] == media_id:
			return m
	return None


def add_media(name: str, url: str):
	media = {"id": str(uuid.uuid4()), "name": name.strip(), "url": url.strip()}
	# Save to DB
	try:
		supa = get_supabase_client()
		supa.table("media").insert({
			"id": media["id"],
			"name": media["name"],
			"url": media["url"]
		}).execute()
	except Exception as e:
		st.warning(f"⚠️ Failed to save to database: {e}")
	st.session_state.media.append(media)
	return media["id"]


def delete_media(media_id: str):
	# Delete from DB
	try:
		supa = get_supabase_client()
		supa.table("media").delete().eq("id", media_id).execute()
		supa.table("analysis").delete().eq("media_id", media_id).execute()
	except Exception as e:
		st.warning(f"⚠️ Failed to delete from database: {e}")
	st.session_state.media = [m for m in st.session_state.media if m["id"] != media_id]
	if st.session_state.active_media_id == media_id:
		st.session_state.active_media_id = None
		st.session_state.view = DASHBOARD


def valid_url(url: str) -> bool:
	try:
		parsed = urlparse(url)
		return bool(parsed.scheme and parsed.netloc)
	except Exception:
		return False


def call_process_api(media_url: str):
	endpoint = f"{API_BASE_URL}/upload-audio"
	payload = {"audioUrl": media_url}
	resp = requests.post(endpoint, json=payload, headers=HEADERS, timeout=120)
	resp.raise_for_status()
	return resp.json()


def render_dashboard():
	# Load from DB once per session
	if not st.session_state.loaded_from_db:
		try:
			supa = get_supabase_client()
			res = supa.table("media").select("id,name,url").order("created_at").execute()
			st.session_state.media = res.data or []
			st.session_state.loaded_from_db = True
		except Exception as e:
			st.warning(f"⚠️ Failed to load media from database: {e}")

	# Centered title with emoji
	st.markdown("<h1 style='text-align: center;'>🎬 EchoStream AI</h1>", unsafe_allow_html=True)
	st.markdown("<p style='text-align: center; color: #666; margin-bottom: 2rem;'>Manage and process your media files with AI-powered insights</p>", unsafe_allow_html=True)

	# New button flow with improved styling
	col1, col2, col3 = st.columns([2, 1, 2])
	with col2:
		if st.button("➕ **New Media**", type="primary", use_container_width=True, key="btn_new_media"):
			st.session_state.show_new = True
			st.rerun()

	st.markdown("---")

	if st.session_state.show_new:
		st.markdown("### ✨ Create New Media")
		with st.container(border=True):
			col1, col2 = st.columns(2)
			
			with col1:
				new_name = st.text_input("🏷️ **Media Name**", placeholder="Enter media name...", key="new_media_name")
			
			with col2:
				new_url = st.text_input("🔗 **Media URL**", placeholder="https://example.com/media.mp3", key="new_media_url")
			
			st.markdown("")  # Add some spacing
			cols = st.columns([1, 1, 1, 3])
			add_disabled = not new_name.strip() or not valid_url(new_url)
			
			with cols[0]:
				if st.button("✅ Add", disabled=add_disabled, type="primary", key="btn_add_media"):
					add_media(new_name, new_url)
					st.session_state.show_new = False
					st.success(f"✅ Media '{new_name}' added successfully!")
					st.rerun()
			
			with cols[1]:
				if st.button("❌ Cancel", key="btn_cancel_new"):
					st.session_state.show_new = False
					st.rerun()

	# Media section
	st.markdown("### 📻 Your Media Files")
	
	if not st.session_state.media:
		st.info("🎯 **No media files yet!** Click the '➕ New Media' button above to add your first media file.")
		return

	# Display media in a grid layout
	media_per_row = 3
	for i in range(0, len(st.session_state.media), media_per_row):
		cols = st.columns(media_per_row)
		for j, m in enumerate(st.session_state.media[i:i+media_per_row]):
			with cols[j]:
				with st.container(border=True):
					st.markdown(f"### 🌐 {m['name']}")
					st.markdown(f"**🔗 URL:** `{m['url'][:50]}{'...' if len(m['url']) > 50 else ''}`")
					
					button_cols = st.columns(3)
					with button_cols[0]:
						if st.button("👀 Open", key=f"open_{m['id']}", type="primary", use_container_width=True):
							st.session_state.active_media_id = m["id"]
							st.session_state.view = DETAIL
							st.rerun()
					
					with button_cols[1]:
						if st.button("🗑️ Delete", key=f"del_{m['id']}", use_container_width=True):
							delete_media(m["id"])
							st.success(f"🗑️ Media '{m['name']}' deleted!")
							st.rerun()

					with button_cols[2]:
						if st.button("📊 Results", key=f"results_{m['id']}", use_container_width=True):
							st.session_state.active_media_id = m["id"]
							st.session_state.view = RESULTS
							st.rerun()


def render_detail():
	media = get_media_by_id(st.session_state.active_media_id)
	if not media:
		st.warning("⚠️ Selected media not found. Returning to dashboard.")
		st.session_state.view = DASHBOARD
		st.rerun()
		return

	# Centered title with emoji
	st.markdown(f"<h1 style='text-align: center;'>🎬 {media['name']}</h1>", unsafe_allow_html=True)
	st.markdown(f"<p style='text-align: center; color: #666;'>🔗 {media['url']}</p>", unsafe_allow_html=True)
	st.markdown("---")

	with st.sidebar:
		st.markdown("## ⚙️ **Process Media**")
		
		name_input = st.text_input("🏷️ **Media Name**", value=media["name"], key=f"name_{media['id']}")
		url_input = st.text_input("🔗 **Media URL**", value=media["url"], key=f"url_{media['id']}")
		
		process_disabled = not valid_url(url_input)
		
		st.markdown("")  # Add spacing
		process = st.button("🚀 **Process Media**", disabled=process_disabled, type="primary", use_container_width=True)
		
		if process_disabled and url_input:
			st.error("❌ Please enter a valid URL")

		# Save updates locally
		media["name"] = name_input.strip()
		media["url"] = url_input.strip()
		try:
			supa = get_supabase_client()
			supa.table("media").update({
				"name": media["name"],
				"url": media["url"]
			}).eq("id", media["id"]).execute()
		except Exception as e:
			st.warning(f"⚠️ Failed to update database: {e}")

		st.markdown("---")
		if st.button("⬅️ **Back to Dashboard**", use_container_width=True):
			st.session_state.view = DASHBOARD
			st.rerun()

	results_placeholder = st.empty()

	if process:
		try:
			with st.spinner("📡 Connecting to API..."):
				data = call_process_api(media["url"])  # { success, transcript, insights }
				
			with st.spinner("🔍 Analyzing content..."):
				if not data.get("success"):
					raise RuntimeError("API did not return success=true")
			
			with st.spinner("✅ Processing complete!"):
				ins = data.get("insights", {})
				summary = ins.get("summary", "")
				topics = ins.get("topics", [])
				actions = ins.get("action_items", [])
				sentiment = ins.get("sentiment", {})
				# Persist analysis
				try:
					supa = get_supabase_client()
					supa.table("analysis").upsert({
						"media_id": media["id"],
						"summary": summary,
						"topics": topics,
						"action_items": actions,
						"sentiment": sentiment
					}, on_conflict="media_id").execute()
				except Exception as e:
					st.warning(f"⚠️ Failed to save analysis: {e}")
				
				with results_placeholder.container():
					with st.expander("📊 **Analysis Results**", expanded=True):
						# Summary Section
						st.markdown("### 📝 **Summary**")
						if summary:
							st.markdown(f"> {summary}")
						else:
							st.info("📝 No summary available")
						
						st.markdown("---")
						
						# Topics, Action Items, and Sentiment in three columns
						col1, col2, col3 = st.columns(3)
						
						with col1:
							st.markdown("### 🏷️ **Topics**")
							if topics:
								for i, topic in enumerate(topics, 1):
									st.markdown(f"**{i}.** {topic}")
							else:
								st.info("🏷️ No topics identified")
						
						with col2:
							st.markdown("### 📋 **Action Items**")
							if actions:
								for i, action in enumerate(actions, 1):
									st.markdown(f"- [ ] **{i}.** {action}")
							else:
								st.info("📋 No action items identified")
						
						with col3:
							st.markdown("### 🎭 **Sentiment Analysis**")
							if sentiment:
								label = sentiment.get("label", "neutral")
								score = sentiment.get("score", 0)
								
								# Emoji mapping for sentiment
								emoji_map = {
									"positive": "😊",
									"negative": "😞",
									"neutral": "😐"
								}
								sentiment_emoji = emoji_map.get(label.lower(), "😐")
								
								st.metric(
									f"{sentiment_emoji} **Overall Sentiment**", 
									f"{label.title()}", 
									delta=f"Score: {score:.2f}"
								)
							else:
								st.info("😊 No sentiment analysis available")
								
		except Exception as e:
			st.error(f"❌ **Processing failed:** {e}")


def render_results():
	media = get_media_by_id(st.session_state.active_media_id)
	if not media:
		st.warning("⚠️ Selected media not found. Returning to dashboard.")
		st.session_state.view = DASHBOARD
		st.rerun()
		return

	st.markdown(f"<h1 style='text-align: center;'>📊 Results: {media['name']}</h1>", unsafe_allow_html=True)
	st.markdown(f"<p style='text-align: center; color: #666;'>🔗 {media['url']}</p>", unsafe_allow_html=True)
	st.markdown("---")

	with st.spinner("Fetching saved analysis..."):
		row = {}
		try:
			supa = get_supabase_client()
			res = supa.table("analysis").select("summary,topics,action_items,sentiment").eq("media_id", media["id"]).single().execute()
			row = res.data or {}
		except Exception as e:
			st.warning(f"⚠️ Failed to load results: {e}")

	if not row:
		st.info("ℹ️ No saved results yet for this media. Process it first from the Details page.")
	else:
		# Summary
		st.markdown("### 📝 Summary")
		if row.get("summary"):
			st.markdown(f"> {row['summary']}")
		else:
			st.info("No summary available")

		st.markdown("---")
		col1, col2, col3 = st.columns(3)
		with col1:
			st.markdown("### 🏷️ Topics")
			for i, topic in enumerate((row.get("topics") or []), 1):
				st.markdown(f"**{i}.** {topic}")
			if not (row.get("topics") or []):
				st.info("No topics identified")
		with col2:
			st.markdown("### 📋 Action Items")
			for i, action in enumerate((row.get("action_items") or []), 1):
				st.markdown(f"- [ ] **{i}.** {action}")
			if not (row.get("action_items") or []):
				st.info("No action items identified")
		with col3:
			st.markdown("### 🎭 Sentiment")
			if row.get("sentiment"):
				label = (row["sentiment"] or {}).get("label", "neutral")
				score = (row["sentiment"] or {}).get("score", 0)
				emoji_map = {"positive": "😊", "negative": "😞", "neutral": "😐"}
				st.metric(f"{emoji_map.get(label.lower(), '😐')} Overall Sentiment", f"{label.title()}", delta=f"Score: {score:.2f}")
			else:
				st.info("No sentiment available")

	st.markdown("---")
	cols = st.columns(2)
	with cols[0]:
		if st.button("⬅️ Back to Dashboard", use_container_width=True):
			st.session_state.view = DASHBOARD
			st.rerun()
	with cols[1]:
		if st.button("🔧 Open Details", use_container_width=True):
			st.session_state.view = DETAIL
			st.rerun()

def main():
	ensure_state()
	
	page = st.session_state.view
	if page == DASHBOARD:
		render_dashboard()
	elif page == DETAIL:
		render_detail()
	elif page == RESULTS:
		render_results()
	else:
		st.session_state.view = DASHBOARD
		st.rerun()


if __name__ == "__main__":
	main()