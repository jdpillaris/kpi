# Generated by Django 4.2.15 on 2024-12-19 14:54

from django.db import migrations


def add_long_running_migration(apps, schema_editor):
    LongRunningMigration = apps.get_model('long_running_migrations', 'LongRunningMigration')  # noqa
    LongRunningMigration.objects.create(
        name='0003_transfer_members_data_ownership_to_org'
    )


def noop(*args, **kwargs):
    pass


class Migration(migrations.Migration):

    dependencies = [
        (
            'long_running_migrations',
            '0002_fix_failed_project_ownership_transfer_with_media_files',
        ),
    ]

    operations = [
        migrations.RunPython(add_long_running_migration, noop),
    ]
