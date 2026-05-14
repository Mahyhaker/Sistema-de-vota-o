"""
FAESA Voting System — Custom JWT Authentication
Separado do views.py para evitar circular import com o DRF.
"""

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed


class UsernameJWTAuthentication(BaseAuthentication):
    """
    Lê o Bearer token, decodifica e retorna nosso User model
    com base no campo 'username' — sem usar o auth.User do Django.
    """

    def authenticate(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header.startswith("Bearer "):
            return None

        raw_token = header.split(" ", 1)[1].strip()

        try:
            from rest_framework_simplejwt.tokens import AccessToken
            from .models import User

            token = AccessToken(raw_token)
            username = token.get("username")

            if not username:
                raise AuthenticationFailed("Token sem campo username.")

            user = User.objects.get(username=username)
            return (user, token)

        except User.DoesNotExist:
            raise AuthenticationFailed("Usuário não encontrado.")
        except AuthenticationFailed:
            raise
        except Exception as e:
            raise AuthenticationFailed(f"Token inválido: {e}")