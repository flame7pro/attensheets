import os
from dotenv import load_dotenv
from mongodb_manager import MongoDBManager

load_dotenv()

def test_mongodb_connection():
    """Test MongoDB connection and basic operations"""
    try:
        mongo_uri = os.getenv("MONGO_URI")
        mongo_db_name = os.getenv("MONGO_DB_NAME", "lernova_db")
        
        print(f"Testing MongoDB connection...")
        print(f"Database: {mongo_db_name}")
        print(f"URI: {mongo_uri[:30]}..." if mongo_uri else "No URI found")
        print()
        
        # Initialize MongoDB Manager
        db = MongoDBManager(mongo_uri=mongo_uri, db_name=mongo_db_name)
        
        # Get database stats
        stats = db.get_database_stats()
        print("\n📊 Database Statistics:")
        for key, value in stats.items():
            print(f"  {key}: {value}")
        
        print("\n✅ MongoDB connection test successful!")
        return True
        
    except Exception as e:
        print(f"\n❌ MongoDB connection test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_mongodb_connection()
