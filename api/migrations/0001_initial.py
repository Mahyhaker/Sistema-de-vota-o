from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="User",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("username", models.CharField(db_index=True, max_length=80, unique=True)),
                ("password_hash", models.CharField(max_length=255)),
            ],
            options={"db_table": "users"},
        ),
        migrations.CreateModel(
            name="Team",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(db_index=True, max_length=100, unique=True)),
                ("created_by", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="teams_created", to="api.user")),
            ],
            options={"db_table": "teams"},
        ),
        migrations.CreateModel(
            name="Vote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("team_name", models.CharField(db_index=True, max_length=100)),
                ("category", models.CharField(max_length=80)),
                ("score", models.FloatField()),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="votes", to="api.user")),
            ],
            options={"db_table": "votes"},
        ),
        migrations.AddConstraint(
            model_name="vote",
            constraint=models.UniqueConstraint(fields=["team_name", "category", "user"], name="uq_vote"),
        ),
    ]