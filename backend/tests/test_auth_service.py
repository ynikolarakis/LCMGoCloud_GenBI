"""Tests for the authentication service."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from src.models.user import User, UserSession
from src.services.auth.auth_service import AuthService


@pytest.fixture
def mock_user():
    """Create a mock user for testing."""
    return User(
        id=uuid4(),
        email="test@example.com",
        password_hash=AuthService.hash_password("testpassword123"),
        display_name="Test User",
        is_active=True,
        is_admin=False,
        session_lifetime_hours=24,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


@pytest.fixture
def mock_user_repo():
    """Create a mock user repository."""
    repo = AsyncMock()
    return repo


@pytest.fixture
def mock_session_repo():
    """Create a mock session repository."""
    repo = AsyncMock()
    return repo


@pytest.fixture
def auth_service(mock_user_repo, mock_session_repo):
    """Create an auth service with mocked repositories."""
    return AuthService(mock_user_repo, mock_session_repo)


class TestPasswordHashing:
    """Tests for password hashing functionality."""

    def test_hash_password_creates_different_hashes(self):
        """Different hashes should be created for the same password."""
        hash1 = AuthService.hash_password("testpassword")
        hash2 = AuthService.hash_password("testpassword")
        assert hash1 != hash2  # bcrypt generates different salts

    def test_verify_password_correct(self):
        """Verify password should return True for correct password."""
        password = "testpassword123"
        hashed = AuthService.hash_password(password)
        assert AuthService.verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """Verify password should return False for incorrect password."""
        hashed = AuthService.hash_password("correctpassword")
        assert AuthService.verify_password("wrongpassword", hashed) is False


class TestTokenCreation:
    """Tests for JWT token creation."""

    def test_create_token_returns_token_and_expiry(self, auth_service, mock_user):
        """Create token should return a token and expiry datetime."""
        token, expires_at = auth_service.create_token(mock_user)

        assert isinstance(token, str)
        assert len(token) > 0
        assert isinstance(expires_at, datetime)
        assert expires_at > datetime.utcnow()

    def test_create_token_respects_user_session_lifetime(self, auth_service, mock_user):
        """Token expiry should respect user's session lifetime setting."""
        mock_user.session_lifetime_hours = 12
        _, expires_at = auth_service.create_token(mock_user)

        expected_min = datetime.utcnow() + timedelta(hours=11)
        expected_max = datetime.utcnow() + timedelta(hours=13)

        assert expected_min < expires_at < expected_max

    def test_create_token_stay_logged_in_extends_expiry(self, auth_service, mock_user):
        """Stay logged in should extend token expiry to 30 days."""
        mock_user.session_lifetime_hours = 24
        _, expires_at = auth_service.create_token(mock_user, stay_logged_in=True)

        # Should be about 30 days (720 hours)
        expected_min = datetime.utcnow() + timedelta(days=29)
        expected_max = datetime.utcnow() + timedelta(days=31)

        assert expected_min < expires_at < expected_max

    def test_decode_token_returns_claims(self, auth_service, mock_user):
        """Decode token should return the correct claims."""
        token, _ = auth_service.create_token(mock_user)
        claims = auth_service.decode_token(token)

        assert claims["sub"] == str(mock_user.id)
        assert claims["email"] == mock_user.email
        assert claims["is_admin"] == mock_user.is_admin
        assert claims["type"] == "access"


class TestAuthentication:
    """Tests for user authentication."""

    @pytest.mark.asyncio
    async def test_authenticate_success(self, auth_service, mock_user_repo, mock_session_repo, mock_user):
        """Successful authentication should return user, token, and expiry."""
        mock_user_repo.get_by_email.return_value = mock_user
        mock_session_repo.create.return_value = MagicMock()
        mock_user_repo.update_last_login.return_value = None

        result = await auth_service.authenticate(
            email="test@example.com",
            password="testpassword123",
        )

        assert result is not None
        user, token, expires_at = result
        assert user.email == mock_user.email
        assert isinstance(token, str)
        assert isinstance(expires_at, datetime)

    @pytest.mark.asyncio
    async def test_authenticate_wrong_password(self, auth_service, mock_user_repo, mock_user):
        """Wrong password should return None."""
        mock_user_repo.get_by_email.return_value = mock_user

        result = await auth_service.authenticate(
            email="test@example.com",
            password="wrongpassword",
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_authenticate_nonexistent_user(self, auth_service, mock_user_repo):
        """Nonexistent user should return None."""
        mock_user_repo.get_by_email.return_value = None

        result = await auth_service.authenticate(
            email="nonexistent@example.com",
            password="anypassword",
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_authenticate_inactive_user(self, auth_service, mock_user_repo, mock_user):
        """Inactive user should return None."""
        mock_user.is_active = False
        mock_user_repo.get_by_email.return_value = mock_user

        result = await auth_service.authenticate(
            email="test@example.com",
            password="testpassword123",
        )

        assert result is None


class TestTokenValidation:
    """Tests for token validation."""

    @pytest.mark.asyncio
    async def test_validate_token_success(self, auth_service, mock_user_repo, mock_session_repo, mock_user):
        """Valid token should return the user."""
        token, expires_at = auth_service.create_token(mock_user)

        mock_session = UserSession(
            id=uuid4(),
            user_id=mock_user.id,
            token_hash="some_hash",
            expires_at=expires_at,
            created_at=datetime.utcnow(),
            last_active_at=datetime.utcnow(),
        )
        mock_session_repo.get_by_token.return_value = mock_session
        mock_user_repo.get_by_id.return_value = mock_user
        mock_session_repo.update_last_active.return_value = None

        result = await auth_service.validate_token(token)

        assert result is not None
        assert result.email == mock_user.email

    @pytest.mark.asyncio
    async def test_validate_token_expired_session(self, auth_service, mock_session_repo, mock_user):
        """Expired session should return None."""
        token, _ = auth_service.create_token(mock_user)

        expired_session = UserSession(
            id=uuid4(),
            user_id=mock_user.id,
            token_hash="some_hash",
            expires_at=datetime.utcnow() - timedelta(hours=1),  # Expired
            created_at=datetime.utcnow(),
            last_active_at=datetime.utcnow(),
        )
        mock_session_repo.get_by_token.return_value = expired_session

        result = await auth_service.validate_token(token)

        assert result is None

    @pytest.mark.asyncio
    async def test_validate_token_revoked_session(self, auth_service, mock_session_repo, mock_user):
        """Revoked (deleted) session should return None."""
        token, _ = auth_service.create_token(mock_user)
        mock_session_repo.get_by_token.return_value = None  # Session not found

        result = await auth_service.validate_token(token)

        assert result is None


class TestPasswordChange:
    """Tests for password change functionality."""

    @pytest.mark.asyncio
    async def test_change_password_success(self, auth_service, mock_user_repo, mock_session_repo, mock_user):
        """Successful password change should return True."""
        mock_user_repo.update_password.return_value = True
        mock_session_repo.delete_all_for_user.return_value = 1

        result = await auth_service.change_password(
            user=mock_user,
            current_password="testpassword123",
            new_password="newpassword456",
        )

        assert result is True
        mock_user_repo.update_password.assert_called_once()
        mock_session_repo.delete_all_for_user.assert_called_once()

    @pytest.mark.asyncio
    async def test_change_password_wrong_current(self, auth_service, mock_user):
        """Wrong current password should return False."""
        result = await auth_service.change_password(
            user=mock_user,
            current_password="wrongpassword",
            new_password="newpassword456",
        )

        assert result is False


class TestPasswordReset:
    """Tests for password reset functionality."""

    @pytest.mark.asyncio
    async def test_request_password_reset_success(self, auth_service, mock_user_repo, mock_user):
        """Request reset for existing user should return a token."""
        mock_user_repo.get_by_email.return_value = mock_user
        mock_user_repo.set_reset_token.return_value = True

        token = await auth_service.request_password_reset("test@example.com")

        assert token is not None
        assert isinstance(token, str)
        mock_user_repo.set_reset_token.assert_called_once()

    @pytest.mark.asyncio
    async def test_request_password_reset_nonexistent(self, auth_service, mock_user_repo):
        """Request reset for nonexistent user should return None."""
        mock_user_repo.get_by_email.return_value = None

        token = await auth_service.request_password_reset("nonexistent@example.com")

        assert token is None

    @pytest.mark.asyncio
    async def test_reset_password_success(self, auth_service, mock_user_repo, mock_session_repo, mock_user):
        """Valid reset token should allow password reset."""
        mock_user.password_reset_expires_at = datetime.utcnow() + timedelta(hours=1)
        mock_user_repo.get_by_reset_token.return_value = mock_user
        mock_user_repo.update_password.return_value = True
        mock_user_repo.clear_reset_token.return_value = None
        mock_session_repo.delete_all_for_user.return_value = 1

        result = await auth_service.reset_password("valid_token", "newpassword123")

        assert result is True
        mock_user_repo.update_password.assert_called_once()
        mock_user_repo.clear_reset_token.assert_called_once()

    @pytest.mark.asyncio
    async def test_reset_password_invalid_token(self, auth_service, mock_user_repo):
        """Invalid reset token should return False."""
        mock_user_repo.get_by_reset_token.return_value = None

        result = await auth_service.reset_password("invalid_token", "newpassword123")

        assert result is False

    @pytest.mark.asyncio
    async def test_reset_password_expired_token(self, auth_service, mock_user_repo, mock_user):
        """Expired reset token should return False."""
        mock_user.password_reset_expires_at = datetime.utcnow() - timedelta(hours=1)
        mock_user_repo.get_by_reset_token.return_value = mock_user

        result = await auth_service.reset_password("expired_token", "newpassword123")

        assert result is False
