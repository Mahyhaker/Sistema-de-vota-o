"""
FAESA Voting System — Views (API endpoints)
"""

from django.conf import settings
from django.db import IntegrityError
import json

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User, Team, Vote

# ── Constants ─────────────────────────────────────────────────────────────────
CATEGORY_WEIGHTS = {
    "Originalidade":      1.5,
    "Design":             1.2,
    "Utilidade":          1.0,
    "Projeto Codificado": 1.5,
    "Produto de Mercado": 1.3,
    "Viabilidade":        1.4,
    "Pitch":              1.1,
}

MAX_SCORE    = 5
TOTAL_WEIGHT = sum(CATEGORY_WEIGHTS.values())


# ── Helpers ───────────────────────────────────────────────────────────────────
def err(message: str, code: int = 400):
    return Response({"message": message}, status=code)


def get_user_from_request(request) -> "User | None":
    user = getattr(request, "user", None)
    if isinstance(user, User):
        return user
    return None


def make_token(user: User) -> str:
    refresh = RefreshToken()
    refresh["username"] = user.username
    refresh.access_token["username"] = user.username
    return str(refresh.access_token)


# ── Auth ──────────────────────────────────────────────────────────────────────
class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data     = request.data
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""

        if not username or not password:
            return err("Usuário e senha são obrigatórios.")
        if len(username) < 3:
            return err("O usuário precisa ter pelo menos 3 caracteres.")
        if len(password) < 6:
            return err("A senha precisa ter pelo menos 6 caracteres.")
        if User.objects.filter(username=username).exists():
            return err("Este nome de usuário já está em uso.")

        user = User(username=username)
        user.set_password(password)
        user.save()

        return Response({"message": "Conta criada com sucesso."}, status=201)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data     = request.data
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return err("Usuário ou senha inválidos.", 401)

        if not user.check_password(password):
            return err("Usuário ou senha inválidos.", 401)

        token = make_token(user)
        return Response({"token": token, "username": user.username})


# ── Teams ─────────────────────────────────────────────────────────────────────
class TeamsView(APIView):

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request):
        teams = Team.objects.order_by("name").values_list("name", flat=True)
        return Response(list(teams))

    def post(self, request):
        user = get_user_from_request(request)
        if not user:
            return err("Usuário não encontrado.", 404)
        if user.username != settings.ADMIN_USERNAME:
            return err("Acesso não autorizado.", 403)

        name = (request.data.get("name") or "").strip()
        if not name:
            return err("O nome da equipe é obrigatório.")
        if len(name) > 100:
            return err("O nome pode ter no máximo 100 caracteres.")
        if Team.objects.filter(name=name).exists():
            return err("Já existe uma equipe com esse nome.")

        Team.objects.create(name=name, created_by=user)
        return Response(
            {"message": f'Equipe "{name}" cadastrada com sucesso.', "name": name},
            status=201
        )


class TeamDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, team_name):
        user = get_user_from_request(request)
        if not user:
            return err("Usuário não encontrado.", 404)
        if user.username != settings.ADMIN_USERNAME:
            return err("Acesso não autorizado.", 403)

        try:
            team = Team.objects.get(name=team_name)
        except Team.DoesNotExist:
            return err("Equipe não encontrada.", 404)

        Vote.objects.filter(team_name=team_name).delete()
        team.delete()
        return Response({"message": f'Equipe "{team_name}" excluída com sucesso.'})


# ── Voting ────────────────────────────────────────────────────────────────────
class VoteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = get_user_from_request(request)
        if not user:
            return err("Usuário não encontrado.", 404)

        if user.username == settings.ADMIN_USERNAME:
            return err("O administrador não pode votar.", 403)

        data      = request.data
        team_name = (data.get("teamName") or "").strip()
        votes     = data.get("votes") or {}

        if not team_name:
            return err("Selecione uma equipe.")
        if not votes:
            return err("Nenhum voto enviado.")
        if not Team.objects.filter(name=team_name).exists():
            return err("Equipe não encontrada. Selecione uma equipe válida.")

        # Impede votar duas vezes na mesma equipe
        if Vote.objects.filter(user=user, team_name=team_name).exists():
            return err("Você já votou nesta equipe.")

        for category, score in votes.items():
            if category not in CATEGORY_WEIGHTS:
                return err(f"Categoria inválida: {category}")
            if not isinstance(score, (int, float)) or not (1 <= score <= MAX_SCORE):
                return err(f"Nota inválida para '{category}'. Use valores de 1 a {MAX_SCORE}.")

        try:
            for category, score in votes.items():
                Vote.objects.create(
                    user=user,
                    team_name=team_name,
                    category=category,
                    score=float(score),
                )
            return Response({"message": "Avaliação registrada com sucesso."})
        except Exception as exc:
            return err(str(exc))


# ── Results ───────────────────────────────────────────────────────────────────
class ResultsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        all_teams = Team.objects.all()
        all_votes = Vote.objects.select_related("user").all()

        agg = {t.name: {"categories": {}, "voters": set()} for t in all_teams}

        for vote in all_votes:
            if vote.team_name not in agg:
                continue
            agg[vote.team_name]["categories"].setdefault(vote.category, []).append(vote.score)
            agg[vote.team_name]["voters"].add(vote.user_id)

        results = []
        for team_name, data in agg.items():
            avg_scores  = {}
            total_score = 0.0

            for category, scores in data["categories"].items():
                weight = CATEGORY_WEIGHTS.get(category, 1.0)
                avg    = sum(scores) / len(scores)
                pct    = (avg / MAX_SCORE * 100) * (weight / TOTAL_WEIGHT)
                avg_scores[category] = round(pct, 1)
                total_score += pct

            results.append({
                "teamName":   team_name,
                "scores":     avg_scores,
                "totalScore": round(min(total_score, 100.0), 1),
                "voterCount": len(data["voters"]),
            })

        results.sort(key=lambda x: x["totalScore"], reverse=True)
        return Response(results)


# ── Health ────────────────────────────────────────────────────────────────────
class HealthView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


# ── User Management (Admin only) ──────────────────────────────────────────────
class UsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Admin only: list all users."""
        user = get_user_from_request(request)
        if not user or user.username != settings.ADMIN_USERNAME:
            return err("Acesso não autorizado.", 403)

        users = User.objects.exclude(username=settings.ADMIN_USERNAME).order_by("username")
        data = [
            {
                "id":       u.id,
                "username": u.username,
                "voteCount": Vote.objects.filter(user=u).values("team_name").distinct().count(),
            }
            for u in users
        ]
        return Response(data)


class UserDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, user_id):
        """Admin only: update username and/or password of a user."""
        admin = get_user_from_request(request)
        if not admin or admin.username != settings.ADMIN_USERNAME:
            return err("Acesso não autorizado.", 403)

        try:
            target = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return err("Usuário não encontrado.", 404)

        if target.username == settings.ADMIN_USERNAME:
            return err("Não é possível editar o administrador.", 403)

        new_username = (request.data.get("username") or "").strip()
        new_password = request.data.get("password") or ""

        if new_username:
            if len(new_username) < 3:
                return err("O usuário precisa ter pelo menos 3 caracteres.")
            if User.objects.filter(username=new_username).exclude(id=user_id).exists():
                return err("Este nome de usuário já está em uso.")
            target.username = new_username

        if new_password:
            if len(new_password) < 6:
                return err("A senha precisa ter pelo menos 6 caracteres.")
            target.set_password(new_password)

        if not new_username and not new_password:
            return err("Informe ao menos um campo para atualizar.")

        target.save()
        return Response({"message": f'Usuário "{target.username}" atualizado com sucesso.'})

    def delete(self, request, user_id):
        """Admin only: delete a user and all their votes."""
        admin = get_user_from_request(request)
        if not admin or admin.username != settings.ADMIN_USERNAME:
            return err("Acesso não autorizado.", 403)

        try:
            target = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return err("Usuário não encontrado.", 404)

        if target.username == settings.ADMIN_USERNAME:
            return err("Não é possível excluir o administrador.", 403)

        username = target.username
        Vote.objects.filter(user=target).delete()
        target.delete()
        return Response({"message": f'Usuário "{username}" excluído com sucesso.'})
