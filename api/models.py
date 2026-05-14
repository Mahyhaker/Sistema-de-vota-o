from django.db import models
from django.contrib.auth.hashers import make_password, check_password


class User(models.Model):
    username = models.CharField(max_length=80, unique=True, db_index=True)
    password_hash = models.CharField(max_length=255)

    class Meta:
        db_table = "users"

    def set_password(self, raw_password: str) -> None:
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password(raw_password, self.password_hash)

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def __str__(self):
        return self.username


class Team(models.Model):
    """Teams are created exclusively by the admin."""
    name = models.CharField(max_length=100, unique=True, db_index=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="teams_created")

    class Meta:
        db_table = "teams"

    def __str__(self):
        return self.name


class Vote(models.Model):
    team_name = models.CharField(max_length=100, db_index=True)
    category = models.CharField(max_length=80)
    score = models.FloatField()
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="votes")

    class Meta:
        db_table = "votes"
        constraints = [
            models.UniqueConstraint(
                fields=["team_name", "category", "user"],
                name="uq_vote"
            )
        ]

    def __str__(self):
        return f"{self.user.username} → {self.team_name} / {self.category}: {self.score}"