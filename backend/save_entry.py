import json
import os
from datetime import datetime

# Define the path to the JSON file
JSON_FILE = 'backend/reflections.json'

def load_reflections():
    """Load reflections from the JSON file."""
    if not os.path.exists(JSON_FILE):
        return []
    try:
        with open(JSON_FILE, 'r') as file:
            return json.load(file)
    except (json.JSONDecodeError, IOError):
        return []

def save_reflections(reflections):
    """Save reflections to the JSON file."""
    try:
        with open(JSON_FILE, 'w') as file:
            json.dump(reflections, file, indent=4)
        print("Entry saved successfully!")
    except IOError as e:
        print(f"Error saving entry: {e}")

def get_user_input():
    """Get reflection details from the user."""
    print("\n--- Add New Journal Entry ---")
    try:
        week = input("Week Number: ").strip()
        title = input("Title: ").strip()
        
        # Default to today's date if empty
        date_str = input(f"Date (YYYY-MM-DD) [Default: {datetime.now().strftime('%Y-%m-%d')}]: ").strip()
        if not date_str:
            date_str = datetime.now().strftime('%Y-%m-%d')
            
        reflection = input("Reflection: ").strip()
        
        # Basic validation
        if not week or not title or not reflection:
            print("Error: Week, Title, and Reflection are required.")
            return None

        return {
            "week": week,
            "title": title,
            "date": date_str,
            "reflection": reflection,
            "timestamp": datetime.now().isoformat()
        }
    except KeyboardInterrupt:
        print("\nOperation cancelled.")
        return None

def main():
    """Main function to run the script."""
    # Ensure we are in the right directory or handle paths correctly
    # This script assumes it's run from the project root (parent of backend/)
    
    if not os.path.exists('backend'):
        print("Error: 'backend' directory not found. Please run this script from the project root.")
        return

    entry = get_user_input()
    if entry:
        reflections = load_reflections()
        reflections.append(entry)
        save_reflections(reflections)

if __name__ == "__main__":
    main()
