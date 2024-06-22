"use strict";


var RE2 = require("re2");
var { loopRegexes, reconciliateSplitMatch, trimString } = require("./utils");


var MAILBOXES_SEPARATORS = [
    ",", // Apple Mail, Gmail, New Outlook 2019, Thunderbird
    ";" // Outlook Live / 365, Yahoo Mail
];

var LINE_REGEXES = [
    "separator",
    "original_subject",
    "original_subject_lax",
    "original_to",
    "original_reply_to",
    "original_cc",
    "original_date"
];

var REGEXES = {
    quote_line_break: /^(>+)\s?$/gm, // Apple Mail, Missive
    quote: /^(>+)\s?/gm, // Apple Mail
    four_spaces: /^(\ {4})\s?/gm, // Outlook 2019
    carriage_return: /\r\n/gm, // Outlook 2019
    byte_order_mark: /\uFEFF/gm, // Outlook 2019
    trailing_non_breaking_space: /\u00A0$/gm, // IONOS by 1 & 1
    non_breaking_space: /\u00A0/gm, // HubSpot

    subject: [
        /^Fw:(.*)/m, // Outlook Live / 365 (cs, en, hr, hu, sk), Yahoo Mail (all locales)
        /^FW:(.*)/m, // Outlook Live / 365 (nl, pt), New Outlook 2019 (cs, en, hu, nl, pt, ru, sk), Outlook 2019 (all locales)
        /^Fwd:(.*)/m // Gmail (all locales), Thunderbird (all locales), Missive (en), MailMate (en)
    ],

    separator: [
        /^>?\s*Begin forwarded message\s?:/m, // Apple Mail (en)
        /^\s*-{8,10}\s*Forwarded message\s*-{8,10}\s*/m, // Gmail (all locales), Missive (en), HubSpot (en)
        /^\s*_{32}\s*$/m, // Outlook Live / 365 (all locales)
        /^\s?Forwarded message:/m, // Mailmate
        /^>?\s*-{6,10} Original Message -{6,10}\s*/m

    ],

    separator_with_information: [
        /^\s?Dne\s?(?<date>.+)\,\s?(?<from_name>.+)\s*[\[|<](?<from_address>.+)[\]|>]\s?napsal\(a\)\s?:/m, // Outlook 2019 (cz)
        /^\s?D.\s?(?<date>.+)\s?skrev\s?\"(?<from_name>.+)\"\s*[\[|<](?<from_address>.+)[\]|>]\s?:/m, // Outlook 2019 (da)
        /^\s?Am\s?(?<date>.+)\s?schrieb\s?\"(?<from_name>.+)\"\s*[\[|<](?<from_address>.+)[\]|>]\s?:/m, // Outlook 2019 (de)
        /^\s?On\s?(?<date>.+)\,\s?\"(?<from_name>.+)\"\s*[\[|<](?<from_address>.+)[\]|>]\s?wrote\s?:/m, // Outlook 2019 (en)
        /^\s?El\s?(?<date>.+)\,\s?\"(?<from_name>.+)\"\s*[\[|<](?<from_address>.+)[\]|>]\s?escribió\s?:/m, // Outlook 2019 (es)
        /^\s?Le\s?(?<date>.+)\,\s?«(?<from_name>.+)»\s*[\[|<](?<from_address>.+)[\]|>]\s?a écrit\s?:/m, // Outlook 2019 (fr)
        /^\s?(?<from_name>.+)\s*[\[|<](?<from_address>.+)[\]|>]\s?kirjoitti\s?(?<date>.+)\s?:/m, // Outlook 2019 (fi)
        /^\s?(?<date>.+)\s?időpontban\s?(?<from_name>.+)\s*[\[|<|(](?<from_address>.+)[\]|>|)]\s?ezt írta\s?:/m, // Outlook 2019 (hu)
        /^\s?Il giorno\s?(?<date>.+)\s?\"(?<from_name>.+)\"\s*[\[|<](?<from_address>.+)[\]|>]\s?ha scritto\s?:/m, // Outlook 2019 (it)
        /^\s?Op\s?(?<date>.+)\s?heeft\s?(?<from_name>.+)\s*[\[|<](?<from_address>.+)[\]|>]\s?geschreven\s?:/m, // Outlook 2019 (nl)
        /^\s?(?<from_name>.+)\s*[\[|<](?<from_address>.+)[\]|>]\s?skrev følgende den\s?(?<date>.+)\s?:/m, // Outlook 2019 (no)
        /^\s?Dnia\s?(?<date>.+)\s?„(?<from_name>.+)”\s*[\[|<](?<from_address>.+)[\]|>]\s?napisał\s?:/m, // Outlook 2019 (pl)
        /^\s?Em\s?(?<date>.+)\,\s?\"(?<from_name>.+)\"\s*[\[|<](?<from_address>.+)[\]|>]\s?escreveu\s?:/m, // Outlook 2019 (pt)
        /^\s?(?<date>.+)\s?пользователь\s?\"(?<from_name>.+)\"\s*[\[|<](?<from_address>.+)[\]|>]\s?написал\s?:/m, // Outlook 2019 (ru)
        /^\s?(?<date>.+)\s?používateľ\s?(?<from_name>.+)\s*\([\[|<](?<from_address>.+)[\]|>]\)\s?napísal\s?:/m, // Outlook 2019 (sk)
        /^\s?Den\s?(?<date>.+)\s?skrev\s?\"(?<from_name>.+)\"\s*[\[|<](?<from_address>.+)[\]|>]\s?följande\s?:/m, // Outlook 2019 (sv)
        /^\s?\"(?<from_name>.+)\"\s*[\[|<](?<from_address>.+)[\]|>]\,\s?(?<date>.+)\s?tarihinde şunu yazdı\s?:/m // Outlook 2019 (tr)
    ],

    original_subject: [
        /^\*?Subject\s?:\*?(.+)/im, // Apple Mail (en), Gmail (all locales), Outlook Live / 365 (all locales), New Outlook 2019 (en), Thunderbird (da, en), Missive (en), HubSpot (en)
    ],

    original_subject_lax: [
        /Subject\s?:(.+)/i, // Yahoo Mail (en)
    ],

    original_from: [
        /^(\*?\s*From\s?:\*?(.+))$/m, // Apple Mail (en), Outlook Live / 365 (all locales), New Outlook 2019 (en), Thunderbird (da, en), Missive (en), HubSpot (en)
        /^From:\s*"(.+)"\s*<(.+)>$/m,

    ],

    original_from_lax: [
        /(\s*From\s?:(.+?)\s?\n?\s*[\[|<](.+?)[\]|>])/, // Yahoo Mail (en)
        /^From:\s*"(.+)"\s*<(.+)>$/m,
    ],

    original_to: [
        /^\*?\s*To\s?:\*?(.+)$/m, // Apple Mail (en), Gmail (all locales), Outlook Live / 365 (all locales), Thunderbird (da, en), Missive (en), HubSpot (en)
        /^To:\s*<(.+)>$/m, // Thunderbird (en)

    ],

    original_to_lax: [
        /\s*To\s?:(.+)$/m, // Yahook Mail (en)
        /^To:\s*<(.+)>$/m
    ],

    original_reply_to: [
        /^\s*Reply-To\s?:(.+)$/m, // Apple Mail (en)
    ],

    original_cc: [
        /^\*?\s*Cc\s?:\*?(.+)$/m, // Apple Mail (en, da, es, fr, hr, it, pt, pt-br, ro, sk), Gmail (all locales), Outlook Live / 365 (all locales), New Outlook 2019 (da, de, en, fr, it, pt-br), Missive (en), HubSpot (de, en, es, it, nl, pt-br)
        /^\s*CC\s?:(.+)$/m, // New Outlook 2019 (es, nl, pt), Thunderbird (da, en, es, fi, hr, hu, it, nl, no, pt, pt-br, ro, tr, uk)
        /^\s*CC：(.+)$/m // HubSpot (ja)
    ],

    original_cc_lax: [
        /\s*Cc\s?:(.+)$/m, // Yahoo Mail (da, en, it, nl, pt, pt-br, ro, tr)
        /\s*CC\s?:(.+)$/m, // Yahoo Mail (de, es)
    ],

    original_date: [
        /^\s*Date\s?:(.+)$/m, // Apple Mail (en, fr), Gmail (all locales), New Outlook 2019 (en, fr), Thunderbird (da, en, fr), Missive (en), HubSpot (en, fr)
        /^Date:\s*(.+)$/m, // Thunderbird (en)
    ],

    original_date_lax: [
        /\s*Datum\s?:(.+)$/m, // Yahoo Mail (cs)
        /^Date:\s*(.+)$/m
    ],

    mailbox: [
        /^\s?\n?\s*<.+?<mailto\:(.+?)>>/, // "<walter.sheltan@acme.com<mailto:walter.sheltan@acme.com>>"
        /^(.+?)\s?\n?\s*<.+?<mailto\:(.+?)>>/, // "Walter Sheltan <walter.sheltan@acme.com<mailto:walter.sheltan@acme.com>>"
        /^(.+?)\s?\n?\s*[\[|<]mailto\:(.+?)[\]|>]/, // "Walter Sheltan <mailto:walter.sheltan@acme.com>" or "Walter Sheltan [mailto:walter.sheltan@acme.com]" or "walter.sheltan@acme.com <mailto:walter.sheltan@acme.com>"
        /^\'(.+?)\'\s?\n?\s*[\[|<](.+?)[\]|>]/, // "'Walter Sheltan' <walter.sheltan@acme.com>" or "'Walter Sheltan' [walter.sheltan@acme.com]" or "'walter.sheltan@acme.com' <walter.sheltan@acme.com>"
        /^\"\'(.+?)\'\"\s?\n?\s*[\[|<](.+?)[\]|>]/, // ""'Walter Sheltan'" <walter.sheltan@acme.com>" or ""'Walter Sheltan'" [walter.sheltan@acme.com]" or ""'walter.sheltan@acme.com'" <walter.sheltan@acme.com>"
        /^\"(.+?)\"\s?\n?\s*[\[|<](.+?)[\]|>]/, // ""Walter Sheltan" <walter.sheltan@acme.com>" or ""Walter Sheltan" [walter.sheltan@acme.com]" or ""walter.sheltan@acme.com" <walter.sheltan@acme.com>"
        /^([^,;]+?)\s?\n?\s*[\[|<](.+?)[\]|>]/, // "Walter Sheltan <walter.sheltan@acme.com>" or "Walter Sheltan [walter.sheltan@acme.com]" or "walter.sheltan@acme.com <walter.sheltan@acme.com>"
        /^(.?)\s?\n?\s*[\[|<](.+?)[\]|>]/, // "<walter.sheltan@acme.com>"
        /^([^\s@]+@[^\s@]+\.[^\s@,]+)/, // "walter.sheltan@acme.com"
        /^([^;].+?)\s?\n?\s*[\[|<](.+?)[\]|>]/, // "Walter, Sheltan <walter.sheltan@acme.com>" or "Walter, Sheltan [walter.sheltan@acme.com]"
    ],

    mailbox_address: [
        /^(([^\s@]+)@([^\s@]+)\.([^\s@]+))$/
    ]
};


/**
 * Parser
 * @class
 */
class Parser {
    /**
     * Constructor
     */
    constructor() {
        this.__regexes = {};

        this.__initRegexes();
    }

    /**
     * Parses the subject part of the email
     * @public
     * @param  {string} subject
     * @return {object} The result
     */
    parseSubject(subject) {
        var _match = loopRegexes(this.__regexes.subject, subject);

        if (_match && _match.length > 1) {
            // Notice: return an empty string if the detected subject is empty \
            //   (e.g. 'Fwd: ')
            return trimString(_match[1]) || "";
        }

        return null;
    }


    /**
     * Parses the body part of the email
     * @public
     * @param  {string}  body
     * @param  {boolean} [forwarded]
     * @return {object}  The result
     */
    parseBody(body, forwarded = false) {
        // Replace carriage return by regular line break
        var _body = body.replace(this.__regexes.carriage_return, "\n");

        // Remove Byte Order Mark
        _body = _body.replace(this.__regexes.byte_order_mark, "");

        // Remove trailing Non-breaking space
        _body = _body.replace(this.__regexes.trailing_non_breaking_space, "");

        // Replace Non-breaking space with regular space
        _body = _body.replace(this.__regexes.non_breaking_space, " ");

        // First method: split via the separator (Apple Mail, Gmail, \
        //   Outlook Live / 365, Outlook 2019, Yahoo Mail, Thunderbird)
        // Notice: use 'line' regex that will capture the line itself, as we may \
        //   need it to build the original email back (in case of nested emails)
        var _match = loopRegexes(this.__regexes.separator_line, _body, "split");

        if (_match && _match.length > 2) {
            // The `split` operation creates a match with 3 substrings:
            //  * 0: anything before the line with the separator (i.e. the message)
            //  * 1: the line with the separator
            //  * 2: anything after the line with the separator (i.e. the body of \
            //       the original email)
            // Notice: in case of nested emails, there may be several matches \
            //   against 'separator_line'. In that case, the `split` operation \
            //   creates a match with (n x 3) substrings. We need to reconciliate \
            //   those substrings.
            var _email = reconciliateSplitMatch(
                _match,

                //-[min_substrings]
                3,

                //-[default_substrings]
                // By default, attach anything after the line with the separator
                [2]
            );

            return {
                body: _body,

                message: trimString(_match[0]),
                email: trimString(_email)
            };
        }

        // Attempt second method?
        // Notice: as this second method is more uncertain (we split via the From \
        //   part, without further verification), we have to be sure we can \
        //   attempt it. The `forwarded` boolean gives the confirmation that the \
        //   email was indeed forwarded (detected from the Subject part)
        if (forwarded === true) {
            // Second method: split via the From part (New Outlook 2019, \
            //   Outlook Live / 365)
            _match = loopRegexes(this.__regexes.original_from, _body, "split");

            if (_match && _match.length > 3) {
                // The `split` operation creates a match with 4 substrings:
                //  * 0: anything before the line with the From part (i.e. the \
                //       message before the original email)
                //  * 1: the line with the From part (in the original email)
                //  * 2: the From part itself
                //  * 3: anything after the line with the From part (i.e. \
                //       the rest of the original email)
                // Notice: in case of nested emails, there may be several matches \
                //   against 'original_from'. In that case, the `split` operation \
                //   creates a match with (n x 4) substrings. We need to reconciliate \
                //   those substrings.
                var _email = reconciliateSplitMatch(
                    _match,

                    //-[min_substrings]
                    4,

                    //-[default_substrings]
                    // By default, attach the line that contains the From part back to \
                    //   the rest of the original email (exclude the From part itself)
                    [1, 3],

                    //-[fn_exlude]
                    // When reconciliating other substrings, we want to exclude the From \
                    //   part itself
                    function (i) {
                        return (i % 3 === 2);
                    }
                );

                return {
                    body: _body,

                    message: trimString(_match[0]),
                    email: trimString(_email)
                };
            }
        }

        return {};
    }


    /**
     * Parses the original forwarded email
     * @public
     * @param  {string} text
     * @param  {string} body
     * @return {object} The parsed email
     */
    parseOriginalEmail(text, body) {
        // Remove Byte Order Mark
        var _text = text.replace(this.__regexes.byte_order_mark, "");

        // Remove ">" at the beginning of each line, while keeping line breaks
        _text = _text.replace(this.__regexes.quote_line_break, "");

        // Remove ">" at the beginning of other lines
        _text = _text.replace(this.__regexes.quote, "");

        // Remove "    " at the beginning of lines
        _text = _text.replace(this.__regexes.four_spaces, "");

        return {
            body: this.__parseOriginalBody(_text),

            from: this.__parseOriginalFrom(_text, body),
            to: this.__parseOriginalTo(_text),
            cc: this.__parseOriginalCc(_text),

            subject: this.__parseOriginalSubject(_text),
            date: this.__parseOriginalDate(_text, body)
        };
    }


    /**
     * Initializes regexes
     * @private
     * @return {undefined}
     */
    __initRegexes() {
        for (var _key in REGEXES) {
            var _key_line = `${_key}_line`;
            var _entry = REGEXES[_key];

            if (Array.isArray(_entry)) {
                this.__regexes[_key] = [];
                this.__regexes[_key_line] = [];

                for (var _i = 0; _i < _entry.length; _i++) {
                    var _regex = _entry[_i];

                    // Build 'line' alternative?
                    if (LINE_REGEXES.includes(_key)) {
                        var _regex_line = this.__buildLineRegex(_regex);

                        this.__regexes[_key_line].push(_regex_line);
                    }

                    this.__regexes[_key].push(
                        new RE2(_regex)
                    );
                }
            } else {
                var _regex = _entry;

                // Build 'line' alternative?
                if (LINE_REGEXES.includes(_key)) {
                    var _regex_line = this.__buildLineRegex(_regex);

                    this.__regexes[_key_line] = _regex_line;
                }

                this.__regexes[_key] = new RE2(_regex);
            }
        }
    }


    /**
     * Builds 'line' alternative regex
     * @private
     * @param  {object} regex
     * @return {object} 'Line' regex
     */
    __buildLineRegex(regex) {
        // A 'line' regex will capture not only inner groups, but also the line \
        //   itself
        // Important: `regex` must be a raw regular expression literal, not an RE2 \
        //   instance. It seems that under some inexplicable circumstances, \
        //   the RE2 instance sometimes doesn't have its `source` and `flags` \
        //   properties correctly populated.
        var _source = `(${regex.source})`;
        var _flags = regex.flags;

        return new RE2(_source, _flags);
    }


    /**
     * Parses the body part
     * @private
     * @param  {string} text
     * @return {string} The parsed body
     */
    __parseOriginalBody(text) {
        var _match = null;

        // First method: extract the text after the Subject part \
        //   (Outlook Live / 365) or after the Cc, To or Reply-To part \
        //   (Apple Mail, Gmail) or Date part (MailMate). A new line must be \
        //   present.
        // Notice: use 'line' regexes that will capture not only the Subject, Cc, \
        //   To or Reply-To part, but also the line itself, as we may need it \
        //   to build the original body back (in case of nested emails)
        var _regexes = [
            this.__regexes.original_subject_line,
            this.__regexes.original_cc_line,
            this.__regexes.original_to_line,
            this.__regexes.original_reply_to_line,
            this.__regexes.original_date_line
        ];

        for (var _i = 0; _i < _regexes.length; _i++) {
            _match = loopRegexes(_regexes[_i], text, "split");

            // A new line must be present between the Cc, To, Reply-To or Subject \
            //   part and the actual body
            if (_match && _match.length > 2 && _match[3].startsWith("\n\n")) {
                // The `split` operation creates a match with 4 substrings:
                //  * 0: anything before the line with the Subject, Cc, To or Reply-To \
                //       part
                //  * 1: the line with the Subject, Cc, To or Reply-To part
                //  * 2: the Subject, Cc, To or Reply-To part itself
                //  * 3: anything after the line with the Subject, Cc, To or Reply-To \
                //       part (i.e. the body of the original email)
                // Notice: in case of nested emails, there may be several matches \
                //   against 'original_subject_line', 'original_cc_line', \
                //   'original_to_line' or 'original_reply_to_line'. In that case, the \
                //   `split` operation creates a match with (n x 4) substrings. We \
                //   need to reconciliate those substrings.
                var _body = reconciliateSplitMatch(
                    _match,

                    //-[min_substrings]
                    4,

                    //-[default_substrings]
                    // By default, attach anything after the line with the Subject, Cc, \
                    //   To or Reply-To part
                    [3],

                    //-[fn_exlude]
                    // When reconciliating other substrings, we want to exclude the \
                    //   Subject, Cc, To or Reply-To part itself
                    function (i) {
                        return (i % 3 === 2);
                    }
                );

                return trimString(_body);
            }
        }

        // Second method: extract the text after the Subject part \
        //   (New Outlook 2019, Yahoo Mail). No new line must be present.
        // Notice: use 'line' regexes that will capture not only the Subject part, \
        //   but also the line itself, as we may need it to build the original \
        //   body back (in case of nested emails)
        _match = loopRegexes(
            [].concat(
                this.__regexes.original_subject_line,
                this.__regexes.original_subject_lax_line
            ),

            text,
            "split"
        );

        // Do not bother checking for new line between the Subject part and the \
        //   actual body (specificity of New Outlook 2019 and Yahoo Mail)
        if (_match && _match.length > 3) {
            // The `split` operation creates a match with 4 substrings:
            //  * 0: anything before the line with the Subject part
            //  * 1: the line with the Subject part (in the original email)
            //  * 2: the Subject part itself
            //  * 3: anything after the line with the Subject part (i.e. the body of \
            //       the original email)
            // Notice: in case of nested emails, there may be several matches \
            //   against 'original_subject_line' and 'original_subject_lax_line'. In \
            //   that case, the `split` operation creates a match with (n x 4) \
            //   substrings. We need to reconciliate those substrings.
            var _body = reconciliateSplitMatch(
                _match,

                //-[min_substrings]
                4,

                //-[default_substrings]
                // By default, attach anything after the line with the Subject part
                [3],

                //-[fn_exlude]
                // When reconciliating other substrings, we want to exclude the \
                //   Subject part itself
                function (i) {
                    return (i % 3 === 2);
                }
            );

            return trimString(_body);
        }

        // Third method: return the raw text, as there is no original information \
        //   embbeded (no Cc, To, Subject, etc.) (Outlook 2019)
        return text;
    }


    /**
     * Parses the author (From)
     * @private
     * @param  {string} text
     * @param  {string} body
     * @return {object} The parsed author
     */
    __parseOriginalFrom(text, body) {
        var _address = null;
        var _name = null;

        // First method: extract the author via the From part (Apple Mail, Gmail, \
        //   Outlook Live / 365, New Outlook 2019, Thunderbird)
        var _author = this.__parseMailbox(this.__regexes.original_from, text);

        // Author found?
        if ((_author || {}).address || (_author || {}).name) {
            return _author;
        }

        // Multiple authors found?
        if (Array.isArray(_author) && (_author[0].address || _author[0].name)) {
            return _author[0];
        }

        // Second method: extract the author via the separator (Outlook 2019)
        var _match = loopRegexes(this.__regexes.separator_with_information, body);

        if (_match && _match.length === 4 && _match.groups) {
            // Notice: the order of parts may change depending on the localization, \
            //   hence the use of named groups
            _address = _match.groups.from_address;
            _name = _match.groups.from_name;

            return this.__prepareMailbox(
                _address,
                _name
            );
        }

        // Third method: extract the author via the From part, using lax regexes \
        //   (Yahoo Mail)
        _match = loopRegexes(this.__regexes.original_from_lax, text);

        if (_match && _match.length > 1) {
            _address = _match[3];
            _name = _match[2];

            return this.__prepareMailbox(
                _address,
                _name
            );
        }

        return this.__prepareMailbox(
            _address,
            _name
        );
    }


    /**
     * Parses the primary recipient(s) (To)
     * @private
     * @param  {string} text
     * @return {object} The parsed primary recipient(s)
     */
    __parseOriginalTo(text) {
        // First method: extract the primary recipient(s) via the To part \
        //   (Apple Mail, Gmail, Outlook Live / 365, New Outlook 2019, Thunderbird)
        var _recipients = this.__parseMailbox(
            this.__regexes.original_to,

            text,
            true  //-[force_array]
        );

        // Recipient(s) found?
        if (Array.isArray(_recipients) && _recipients.length > 0) {
            return _recipients;
        }

        // Second method: the Subject, Date and Cc parts are stuck to the To part, \
        //   remove them before attempting a new extract, using lax regexes \
        //   (Yahoo Mail)
        var _cleanText = loopRegexes(
            this.__regexes.original_subject_lax,
            text,

            "replace"
        );

        _cleanText = loopRegexes(
            this.__regexes.original_date_lax,
            _cleanText,

            "replace"
        );

        _cleanText = loopRegexes(
            this.__regexes.original_cc_lax,
            _cleanText,

            "replace"
        );

        return this.__parseMailbox(
            this.__regexes.original_to_lax,

            _cleanText,
            true  //-[force_array]
        );
    }


    /**
     * Parses the carbon-copy recipient(s) (Cc)
     * @private
     * @param  {string} text
     * @return {object} The parsed carbon-copy recipient(s)
     */
    __parseOriginalCc(text) {
        // First method: extract the carbon-copy recipient(s) via the Cc part \
        //   (Apple Mail, Gmail, Outlook Live / 365, New Outlook 2019, Thunderbird)
        var _recipients = this.__parseMailbox(
            this.__regexes.original_cc,

            text,
            true  //-[force_array]
        );

        // Recipient(s) found?
        if (Array.isArray(_recipients) && _recipients.length > 0) {
            return _recipients;
        }

        // Second method: the Subject and Date parts are stuck to the To part, \
        //   remove them before attempting a new extract, using lax regexes \
        //   (Yahoo Mail)
        var _cleanText = loopRegexes(
            this.__regexes.original_subject_lax,
            text,

            "replace"
        );

        _cleanText = loopRegexes(
            this.__regexes.original_date_lax,
            _cleanText,

            "replace"
        );

        return this.__parseMailbox(
            this.__regexes.original_cc_lax,

            _cleanText,
            true  //-[force_array]
        );
    }


    /**
     * Parses mailboxes(s)
     * @private
     * @param  {object}  regexes
     * @param  {string}  text
     * @param  {boolean} [force_array]
     * @return {object}  The parsed mailboxes(s)
     */
    __parseMailbox(regexes, text, force_array = false) {
        var _match = loopRegexes(regexes, text);

        if (_match && _match.length > 0) {
            var _mailboxesLine = trimString(_match[_match.length - 1]);

            if (_mailboxesLine) {
                var _mailboxes = [];

                while (_mailboxesLine) {
                    var _mailboxMatch = loopRegexes(
                        this.__regexes.mailbox,
                        _mailboxesLine
                    );

                    // Address and / or name available?
                    if (_mailboxMatch && _mailboxMatch.length > 0) {
                        var _address = null;
                        var _name = null;

                        // Address and name available?
                        if (_mailboxMatch.length === 3) {
                            _address = _mailboxMatch[2];
                            _name = _mailboxMatch[1];
                        } else {
                            _address = _mailboxMatch[1];
                        }

                        _mailboxes.push(
                            this.__prepareMailbox(
                                _address,
                                _name
                            )
                        );

                        // Remove matched mailbox from mailboxes line
                        _mailboxesLine = trimString(
                            _mailboxesLine.replace(_mailboxMatch[0], "")
                        );

                        if (_mailboxesLine) {
                            // Remove leading mailboxes separator \
                            //   (", Nicholas <nicholas@globex.corp>")
                            for (var _i = 0; _i < MAILBOXES_SEPARATORS.length; _i++) {
                                var _separator = MAILBOXES_SEPARATORS[_i];

                                if (_mailboxesLine[0] === _separator) {
                                    _mailboxesLine = trimString(_mailboxesLine.substring(1));

                                    break;
                                }
                            }
                        }
                    } else {
                        _mailboxes.push(
                            this.__prepareMailbox(
                                _mailboxesLine,
                                null
                            )
                        );

                        // No more matches
                        _mailboxesLine = "";
                    }
                }

                // Return multiple mailboxes
                if (_mailboxes.length > 1) {
                    return _mailboxes;
                }

                // Return single mailbox
                return (force_array === true) ? _mailboxes : _mailboxes[0];
            }
        }

        // No mailbox found
        return (force_array === true) ? [] : null;
    }


    /**
     * Parses the subject part
     * @private
     * @param  {string} text
     * @return {string} The parsed subject
     */
    __parseOriginalSubject(text) {
        // First method: extract the subject via the Subject part (Apple Mail, \
        //   Gmail, Outlook Live / 365, New Outlook 2019, Thunderbird)
        var _match = loopRegexes(this.__regexes.original_subject, text);

        if (_match && _match.length > 0) {
            return trimString(_match[1]);
        }

        // Second method: extract the subject via the Subject part, using lax \
        //   regexes (Yahoo Mail)
        _match = loopRegexes(this.__regexes.original_subject_lax, text);

        if (_match && _match.length > 0) {
            return trimString(_match[1]);
        }

        return null;
    }


    /**
     * Parses the date part
     * @private
     * @param  {string} text
     * @param  {string} body
     * @return {string} The parsed date
     */
    __parseOriginalDate(text, body) {
        // First method: extract the date via the Date part (Apple Mail, Gmail, \
        //   Outlook Live / 365, New Outlook 2019, Thunderbird)
        var _match = loopRegexes(this.__regexes.original_date, text);

        if (_match && _match.length > 0) {
            return trimString(_match[1]);
        }

        // Second method: extract the date via the separator (Outlook 2019)
        _match = loopRegexes(this.__regexes.separator_with_information, body);

        if (_match && _match.length === 4 && _match.groups) {
            // Notice: the order of parts may change depending on the localization, \
            //   hence the use of named groups
            return trimString(_match.groups.date);
        }

        // Third method: the Subject part is stuck to the Date part, remove it \
        //   before attempting a new extract, using lax regexes (Yahoo Mail)
        var _cleanText = loopRegexes(
            this.__regexes.original_subject_lax,
            text,

            "replace"
        );

        _match = loopRegexes(this.__regexes.original_date_lax, _cleanText);

        if (_match && _match.length > 0) {
            return trimString(_match[1]);
        }

        return null;
    }


    /**
     * Prepares mailbox
     * @private
     * @param  {string} address
     * @param  {string} name
     * @return {string} The prepared mailbox
     */
    __prepareMailbox(address, name) {
        var _address = trimString(address);
        var _name = trimString(name);

        // Make sure mailbox address is valid
        var _mailboxAddressMatch = loopRegexes(
            this.__regexes.mailbox_address,
            _address
        );

        // Invalid mailbox address? Some clients only include the name
        if ((_mailboxAddressMatch || []).length === 0) {
            _name = _address;
            _address = null;
        }

        _address = _address || null;
        _name = _name || null;

        return {
            address: _address,

            // Some clients fill the name with the address \
            //   ("bessie.berry@acme.com <bessie.berry@acme.com>")
            name: (_address !== _name) ? _name : null
        };
    }
}


module.exports = Parser;
