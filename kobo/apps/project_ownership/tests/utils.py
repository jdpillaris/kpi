from django.db.models import F
from kpi.models.asset import Asset


class MockServiceUsageCalculator:

    def get_storage_usage(self):

        assets = Asset.objects.annotate(user_id=F('owner_id')).filter(
            self._user_id_query
        )

        total_storage_bytes = 0
        for asset in assets:
            if asset.has_deployment:
                for submission in asset.deployment.get_submissions(asset.owner):
                    total_storage_bytes += sum(
                        [att['bytes'] for att in submission['_attachments']]
                    )
        return total_storage_bytes

    def get_submission_counters(self):
        total_submission_count = {
            'all_time': 0,
            'current_year': 0,
            'current_month': 0,
        }
        assets = Asset.objects.annotate(user_id=F('owner_id')).filter(
            self._user_id_query
        )
        for asset in assets:
            if asset.has_deployment:
                submissions = asset.deployment.get_submissions(asset.owner)
                total_submission_count['all_time'] += len(submissions)
                total_submission_count['current_year'] += len(submissions)
                total_submission_count['current_month'] += len(submissions)

        return total_submission_count
