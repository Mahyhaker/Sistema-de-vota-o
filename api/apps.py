from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "api"

    def ready(self):
        """Seed the admin user when the server starts."""
        try:
            from .models import User
            from .views import ADMIN_USERNAME, ADMIN_PASSWORD

            admin, created = User.objects.get_or_create(username=ADMIN_USERNAME)
            admin.set_password(ADMIN_PASSWORD)
            admin.save()
        except Exception:
            # DB might not exist yet on first run — manage.py migrate handles it
            pass