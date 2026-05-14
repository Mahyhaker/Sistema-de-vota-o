"""
FAESA Voting System — API URL patterns
All routes are mounted under /api/ by core/urls.py
"""

from django.urls import path
from .views import (
    RegisterView,
    LoginView,
    TeamsView,
    TeamDetailView,
    VoteView,
    ResultsView,
    HealthView,
    UsersView,
    UserDetailView,
)

urlpatterns = [
    path("register",                  RegisterView.as_view()),
    path("login",                     LoginView.as_view()),
    path("teams",                     TeamsView.as_view()),
    path("teams/<str:team_name>",     TeamDetailView.as_view()),
    path("vote",                      VoteView.as_view()),
    path("results",                   ResultsView.as_view()),
    path("health",                    HealthView.as_view()),
    path("users",                     UsersView.as_view()),
    path("users/<int:user_id>",       UserDetailView.as_view()),
]