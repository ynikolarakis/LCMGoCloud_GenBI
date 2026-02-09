"""Tests for the user manager service."""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4

from src.models.user import User, UserCreate, UserRateLimit
from src.services.auth.user_manager import UserManager


@pytest.fixture
def mock_conn():
    """Create a mock database connection."""
    return AsyncMock()


@pytest.fixture
def mock_user():
    """Create a mock user for testing."""
    return User(
        id=uuid4(),
        email="test@example.com",
        password_hash="$2b$12$hashed",
        display_name="Test User",
        is_active=True,
        is_admin=False,
        session_lifetime_hours=24,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


class TestUserCreation:
    """Tests for user creation."""

    @pytest.mark.asyncio
    async def test_create_user_success(self, mock_conn, mock_user):
        """Creating a new user should succeed."""
        manager = UserManager(mock_conn)

        # Patch the repositories
        manager.user_repo = AsyncMock()
        manager.user_repo.get_by_email = AsyncMock(return_value=None)
        manager.user_repo.create = AsyncMock(return_value=mock_user)

        user = await manager.create_user(
            UserCreate(
                email="test@example.com",
                password="testpassword123",
                display_name="Test User",
                is_admin=False,
                session_lifetime_hours=24,
            )
        )

        assert user.email == "test@example.com"
        manager.user_repo.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_user_duplicate_email(self, mock_conn, mock_user):
        """Creating a user with existing email should raise ValueError."""
        manager = UserManager(mock_conn)

        # Patch the repository to return existing user
        manager.user_repo = AsyncMock()
        manager.user_repo.get_by_email = AsyncMock(return_value=mock_user)

        with pytest.raises(ValueError) as exc:
            await manager.create_user(
                UserCreate(
                    email="test@example.com",
                    password="testpassword123",
                )
            )

        assert "already exists" in str(exc.value)


class TestUserRetrieval:
    """Tests for user retrieval."""

    @pytest.mark.asyncio
    async def test_get_user_by_id(self, mock_conn, mock_user):
        """Getting a user by ID should return the user."""
        manager = UserManager(mock_conn)

        manager.user_repo = AsyncMock()
        manager.user_repo.get_by_id = AsyncMock(return_value=mock_user)

        user = await manager.get_user(mock_user.id)

        assert user is not None
        assert user.email == mock_user.email

    @pytest.mark.asyncio
    async def test_get_user_by_id_not_found(self, mock_conn):
        """Getting a nonexistent user should return None."""
        manager = UserManager(mock_conn)

        manager.user_repo = AsyncMock()
        manager.user_repo.get_by_id = AsyncMock(return_value=None)

        user = await manager.get_user(uuid4())

        assert user is None

    @pytest.mark.asyncio
    async def test_get_user_by_email(self, mock_conn, mock_user):
        """Getting a user by email should return the user."""
        manager = UserManager(mock_conn)

        manager.user_repo = AsyncMock()
        manager.user_repo.get_by_email = AsyncMock(return_value=mock_user)

        user = await manager.get_user_by_email("test@example.com")

        assert user is not None
        assert user.email == mock_user.email


class TestUserUpdate:
    """Tests for user updates."""

    @pytest.mark.asyncio
    async def test_update_user(self, mock_conn, mock_user):
        """Updating a user should return the updated user."""
        manager = UserManager(mock_conn)

        updated_user = User(
            **{**mock_user.model_dump(), "display_name": "Updated Name"}
        )

        manager.user_repo = AsyncMock()
        manager.user_repo.update = AsyncMock(return_value=updated_user)

        user = await manager.update_user(
            mock_user.id,
            display_name="Updated Name",
        )

        assert user is not None
        assert user.display_name == "Updated Name"

    @pytest.mark.asyncio
    async def test_deactivate_user(self, mock_conn, mock_user):
        """Deactivating a user should return True on success."""
        manager = UserManager(mock_conn)

        manager.session_repo = AsyncMock()
        manager.session_repo.delete_all_for_user = AsyncMock(return_value=1)

        manager.user_repo = AsyncMock()
        manager.user_repo.deactivate = AsyncMock(return_value=True)

        result = await manager.deactivate_user(mock_user.id)

        assert result is True
        manager.session_repo.delete_all_for_user.assert_called_once()
        manager.user_repo.deactivate.assert_called_once()

    @pytest.mark.asyncio
    async def test_activate_user(self, mock_conn, mock_user):
        """Activating a user should return True on success."""
        manager = UserManager(mock_conn)

        manager.user_repo = AsyncMock()
        manager.user_repo.activate = AsyncMock(return_value=True)

        result = await manager.activate_user(mock_user.id)

        assert result is True


class TestUserDeletion:
    """Tests for user deletion."""

    @pytest.mark.asyncio
    async def test_delete_user_success(self, mock_conn, mock_user):
        """Deleting an existing user should return True."""
        manager = UserManager(mock_conn)

        manager.user_repo = AsyncMock()
        manager.user_repo.get_by_id = AsyncMock(return_value=mock_user)
        manager.user_repo.delete = AsyncMock(return_value=True)

        result = await manager.delete_user(mock_user.id)

        assert result is True

    @pytest.mark.asyncio
    async def test_delete_user_not_found(self, mock_conn):
        """Deleting a nonexistent user should return False."""
        manager = UserManager(mock_conn)

        manager.user_repo = AsyncMock()
        manager.user_repo.get_by_id = AsyncMock(return_value=None)

        result = await manager.delete_user(uuid4())

        assert result is False


class TestRateLimits:
    """Tests for rate limit management."""

    @pytest.mark.asyncio
    async def test_get_rate_limit(self, mock_conn, mock_user):
        """Getting a rate limit should return the limit."""
        manager = UserManager(mock_conn)

        rate_limit = UserRateLimit(
            id=uuid4(),
            user_id=mock_user.id,
            requests_per_minute=100,
            queries_per_day=1000,
        )

        manager.rate_limit_repo = AsyncMock()
        manager.rate_limit_repo.get = AsyncMock(return_value=rate_limit)

        result = await manager.get_rate_limit(mock_user.id)

        assert result is not None
        assert result.requests_per_minute == 100

    @pytest.mark.asyncio
    async def test_set_rate_limit(self, mock_conn, mock_user):
        """Setting a rate limit should return the updated limit."""
        manager = UserManager(mock_conn)

        rate_limit = UserRateLimit(
            id=uuid4(),
            user_id=mock_user.id,
            requests_per_minute=200,
            queries_per_day=5000,
        )

        manager.rate_limit_repo = AsyncMock()
        manager.rate_limit_repo.upsert = AsyncMock(return_value=rate_limit)

        result = await manager.set_rate_limit(
            mock_user.id,
            requests_per_minute=200,
            queries_per_day=5000,
        )

        assert result.requests_per_minute == 200
        assert result.queries_per_day == 5000

    @pytest.mark.asyncio
    async def test_remove_rate_limit(self, mock_conn, mock_user):
        """Removing a rate limit should return True on success."""
        manager = UserManager(mock_conn)

        manager.rate_limit_repo = AsyncMock()
        manager.rate_limit_repo.delete = AsyncMock(return_value=True)

        result = await manager.remove_rate_limit(mock_user.id)

        assert result is True


class TestPasswordReset:
    """Tests for admin password reset."""

    @pytest.mark.asyncio
    async def test_reset_password(self, mock_conn, mock_user):
        """Admin reset password should update password and logout sessions."""
        manager = UserManager(mock_conn)

        manager.user_repo = AsyncMock()
        manager.user_repo.update_password = AsyncMock(return_value=True)
        manager.user_repo.get_by_id = AsyncMock(return_value=mock_user)

        manager.session_repo = AsyncMock()
        manager.session_repo.delete_all_for_user = AsyncMock(return_value=2)

        result = await manager.reset_password(mock_user.id, "newpassword123")

        assert result is True
        manager.user_repo.update_password.assert_called_once()
        manager.session_repo.delete_all_for_user.assert_called_once()
