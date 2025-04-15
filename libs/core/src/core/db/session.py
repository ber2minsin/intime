from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
import os

DB_PATH = os.environ.get("INTIME_DB_PATH", "sqlite:///intime.db")
engine = create_engine(DB_PATH)

Session = scoped_session(sessionmaker(bind=engine))


def get_session():
    """Get a database session."""
    return Session()
