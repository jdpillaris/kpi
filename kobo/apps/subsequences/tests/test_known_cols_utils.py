import pytest


from kobo.apps.subsequences.utils.parse_known_cols import (
    parse_known_cols,
)


def test_known_cols_transc_duplicates():
    results = parse_known_cols([
        'col-qpath:transc_a:en',
        'col-qpath:transc_a:en',
    ])
    assert len(results) == 1
    assert results[0]['language'] == 'en'


def test_known_cols_transl_duplicates():
    results = parse_known_cols([
        'col-qpath:transl_a:fr',
        'col-qpath:transl_a:fr',
    ])
    assert len(results) == 1


def test_known_cols_transc_uniqs():
    results = parse_known_cols([
        'col-qpath1:transc_a:en',
        'col-qpath1:transc_b:fr',
        'col-qpath2:transc_a:en',
        'col-qpath2:transc_b:fr',
    ])
    assert len(results) == 4
    rs = {}
    for prop in ['language', 'label', 'qpath']:
        rs[prop] = [rr[prop] for rr in results]
    assert rs['language'] == ['en', 'fr', 'en', 'fr']
    assert rs['label'] == [
        'qpath1 - transcript',
        'qpath1 - transcript',
        'qpath2 - transcript',
        'qpath2 - transcript',
    ]
    assert rs['qpath'] == [
        'col-qpath1-transcript-en',
        'col-qpath1-transcript-fr',
        'col-qpath2-transcript-en',
        'col-qpath2-transcript-fr',
    ]


def test_known_cols_transl_uniqs():
    results = parse_known_cols([
        'col-qpath1:transl_a:en',
        'col-qpath1:transl_b:fr',
        'col-qpath2:transl_a:en',
        'col-qpath2:transl_b:fr',
    ])
    assert len(results) == 4
    langs = [r['language'] for r in results]
    labls = [r['label'] for r in results]
    qpths = [r['qpath'] for r in results]
    assert qpths == [
        'col-qpath1-translation-en',
        'col-qpath1-translation-fr',
        'col-qpath2-translation-en',
        'col-qpath2-translation-fr',
    ]


def test_known_cols_combos():
    results = parse_known_cols([
        'col-qpath1:transl_a:en',
        'col-qpath1:transl_b:fr',
        'col-qpath2:transl_a:en',
        'col-qpath2:transl_b:fr',
    ])
    langs = [r['language'] for r in results]
    assert langs == ['en', 'fr', 'en', 'fr']
    assert len(results) == 4


def test_known_cols_grouped_source():
    # TODO: refer to commit d013bfe0f5 and `extend_col_deets()` to figure out
    # how this should behave
    results = parse_known_cols([
        # `group` is the group name
        # `question` is the (source) question name
        'group-question:transcript:en',
        'group-question:translation:es',
    ])
    sources = [r['source'] for r in results]
    qpaths = [r['qpath'] for r in results]
    names = [r['name'] for r in results]
    assert set(sources) == set(('group-question',))
    assert qpaths == [
        'group-question-transcript-en',
        'group-question-translation-es',
    ]
    assert names == [
        # This can't be right (why a mixture of dash and slash delimiters?) but
        # it is at least what the front end expects
        'group-question/transcript_en',
        'group-question/translation_es',
    ]
