from json import dumps, loads
from typing import Optional

from django.apps import apps
from django.conf import settings
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from kobo.apps.kobo_auth.shortcuts import User
from kobo.apps.openrosa.apps.logger.models import DailyXFormSubmissionCounter, XForm
from kobo.apps.organizations.utils import (
    get_monthly_billing_dates,
    get_yearly_billing_dates,
)
from kobo.apps.stripe.constants import ACTIVE_STRIPE_STATUSES
from kpi.utils.cache import CachedClass, cached_class_property


class ServiceUsageCalculator(CachedClass):
    CACHE_TTL = settings.ENDPOINT_CACHE_DURATION

    def __init__(
        self,
        user: User,
        organization: Optional['Organization'],
        disable_cache: bool = False,
    ):
        self.user = user
        self.organization = organization
        self._cache_available = not disable_cache
        self._user_ids = [user.pk]
        self._user_id_query = self._filter_by_user([user.pk])
        if organization and settings.STRIPE_ENABLED:
            # If the user is in an organization and has an enterprise plan, get all org
            # users we evaluate this queryset instead of using it as a subquery. It's
            # referencing fields from the auth_user tables on kpi *and* kobocat,
            # making getting results in a single query not feasible until those tables
            # are combined.
            user_ids = list(
                User.objects.filter(
                    organizations_organization__id=organization.id,
                    organizations_organization__djstripe_customers__subscriptions__status__in=ACTIVE_STRIPE_STATUSES,  # noqa: E501
                    organizations_organization__djstripe_customers__subscriptions__items__price__product__metadata__has_key='plan_type',  # noqa: E501
                    organizations_organization__djstripe_customers__subscriptions__items__price__product__metadata__plan_type='enterprise',  # noqa: E501
                ).values_list('pk', flat=True)[: settings.ORGANIZATION_USER_LIMIT]
            )
            if user_ids:
                self._user_ids = user_ids
                self._user_id_query = self._filter_by_user(user_ids)

        now = timezone.now()
        self.current_month_start, self.current_month_end = get_monthly_billing_dates(
            organization
        )
        self.current_year_start, self.current_year_end = get_yearly_billing_dates(
            organization
        )
        self.current_month_filter = Q(date__range=[self.current_month_start, now])
        self.current_year_filter = Q(date__range=[self.current_year_start, now])
        self._setup_cache()

    def get_nlp_usage_by_type(self, usage_key: str) -> int:
        """Returns the usage for a given organization and usage key. The usage key
        should be the value from the USAGE_LIMIT_MAP found in the stripe kobo app.
        """
        if self.organization is None:
            return None

        billing_details = self.organization.active_subscription_billing_details()
        if not billing_details:
            return None

        interval = billing_details['recurring_interval']
        nlp_usage = self.get_nlp_usage_counters()

        cached_usage = {
            'asr_seconds': nlp_usage[f'asr_seconds_current_{interval}'],
            'mt_characters': nlp_usage[f'mt_characters_current_{interval}'],
        }

        return cached_usage[usage_key]

    def get_last_updated(self):
        return self._cache_last_updated()

    @cached_class_property(
        key='nlp_usage_counters', serializer=dumps, deserializer=loads
    )
    def get_nlp_usage_counters(self):
        NLPUsageCounter = apps.get_model('trackers', 'NLPUsageCounter')  # noqa

        nlp_tracking = (
            NLPUsageCounter.objects.only(
                'date', 'total_asr_seconds', 'total_mt_characters'
            )
            .filter(self._user_id_query)
            .aggregate(
                asr_seconds_current_year=Coalesce(
                    Sum('total_asr_seconds', filter=self.current_year_filter), 0
                ),
                mt_characters_current_year=Coalesce(
                    Sum('total_mt_characters', filter=self.current_year_filter),
                    0,
                ),
                asr_seconds_current_month=Coalesce(
                    Sum('total_asr_seconds', filter=self.current_month_filter),
                    0,
                ),
                mt_characters_current_month=Coalesce(
                    Sum('total_mt_characters', filter=self.current_month_filter),
                    0,
                ),
                asr_seconds_all_time=Coalesce(Sum('total_asr_seconds'), 0),
                mt_characters_all_time=Coalesce(Sum('total_mt_characters'), 0),
            )
        )

        total_nlp_usage = {}
        for nlp_key, count in nlp_tracking.items():
            total_nlp_usage[nlp_key] = count if count is not None else 0

        return total_nlp_usage

    @cached_class_property(key='storage_usage', serializer=str, deserializer=int)
    def get_storage_usage(self):
        """
        Get the storage used by non-(soft-)deleted projects for all users

        Users are represented by their ids with `self._user_ids`
        """
        xforms = (
            XForm.objects.only('attachment_storage_bytes', 'id')
            .exclude(pending_delete=True)
            .filter(self._user_id_query)
        )

        total_storage_bytes = xforms.aggregate(
            bytes_sum=Coalesce(Sum('attachment_storage_bytes'), 0),
        )

        return total_storage_bytes['bytes_sum'] or 0

    @cached_class_property(
        key='submission_counters', serializer=dumps, deserializer=loads
    )
    def get_submission_counters(self):
        """
        Calculate submissions for all users' projects even their deleted ones

        Users are represented by their ids with `self._user_ids`
        """
        submission_count = (
            DailyXFormSubmissionCounter.objects.only('counter', 'user_id')
            .filter(self._user_id_query)
            .aggregate(
                all_time=Coalesce(Sum('counter'), 0),
                current_year=Coalesce(
                    Sum('counter', filter=self.current_year_filter), 0
                ),
                current_month=Coalesce(
                    Sum('counter', filter=self.current_month_filter), 0
                ),
            )
        )

        total_submission_count = {}
        for submission_key, count in submission_count.items():
            total_submission_count[submission_key] = count if count is not None else 0

        return total_submission_count

    def _get_cache_hash(self):
        if self.organization is None:
            return f'user-{self.user.id}'
        else:
            return f'organization-{self.organization.id}'

    def _filter_by_user(self, user_ids: list) -> Q:
        """
        Turns a list of user ids into a query object to filter by
        """
        return Q(user_id__in=user_ids)
