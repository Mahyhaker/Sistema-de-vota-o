import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from api.models import User


class Command(BaseCommand):
    help = "Create or update the application admin user from environment variables."

    def handle(self, *args, **options):
        username = settings.ADMIN_USERNAME
        password = os.environ.get("ADMIN_PASSWORD")

        if not password:
            raise CommandError("ADMIN_PASSWORD must be set to seed the admin user.")

        user, created = User.objects.get_or_create(username=username)
        user.set_password(password)
        user.save(update_fields=["password_hash"] if not created else None)

        action = "created" if created else "updated"
        self.stdout.write(self.style.SUCCESS(f'Admin user "{username}" {action}.'))
