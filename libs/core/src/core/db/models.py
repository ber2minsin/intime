from sqlalchemy import Column, Integer, String, DateTime, LargeBinary, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

Base = declarative_base()


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    process_id = Column(Integer, nullable=False)
    executable_path = Column(String, nullable=True)
    application_name = Column(String, nullable=True)
    icon = Column(LargeBinary, nullable=True)

    sessions = relationship(
        "ApplicationSession", back_populates="application", cascade="all, delete-orphan"
    )

    __table_args__ = ({"sqlite_autoincrement": True},)


class ApplicationSession(Base):
    __tablename__ = "application_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    application_id = Column(
        Integer, ForeignKey("applications.id", ondelete="CASCADE"), nullable=False
    )
    started_at = Column(DateTime, server_default=func.now(), nullable=False)
    closed_at = Column(DateTime, nullable=True)

    application = relationship("Application", back_populates="sessions")
    window_activities = relationship(
        "WindowActivity", back_populates="session", cascade="all, delete-orphan"
    )

    __table_args__ = ({"sqlite_autoincrement": True},)


class WindowActivity(Base):
    __tablename__ = "window_activity"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        Integer,
        ForeignKey("application_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    handle = Column(Integer, nullable=False)
    title = Column(String, nullable=False)
    activated_at = Column(DateTime, server_default=func.now(), nullable=False)
    screenshot_blob = Column(LargeBinary, nullable=True)

    session = relationship("ApplicationSession", back_populates="window_activities")

    __table_args__ = ({"sqlite_autoincrement": True},)
