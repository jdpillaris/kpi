# Generated by Django 2.2.7 on 2021-11-18 19:26

import django.contrib.postgres.fields.jsonb
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('kpi', '0042_auto_20211118_1926'),
    ]

    operations = [
        migrations.CreateModel(
            name='MockSubmission',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date_created', models.DateTimeField(auto_now_add=True)),
                ('date_modified', models.DateTimeField(auto_now=True)),
                ('uuid', models.CharField(max_length=40, null=True)),
                ('content', django.contrib.postgres.fields.jsonb.JSONField(default=dict)),
                ('asset', models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='submissions', to='kpi.Asset')),
            ],
        ),
    ]
