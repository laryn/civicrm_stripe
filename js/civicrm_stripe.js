/**
 * @file
 * JS Integration between CiviCRM & Stripe.
 */
(function($, CRM) {

  var $form, $submit, buttonText;
  var isWebform = false;

  // Response from Stripe.createToken.
  function stripeResponseHandler(status, response) {
    if (response.error) {
      $('html, body').animate({scrollTop: 0}, 300);
      // Show the errors on the form.
      if ($(".messages.crm-error.stripe-message").length > 0) {
        $(".messages.crm-error.stripe-message").slideUp();
        $(".messages.crm-error.stripe-message:first").remove();
      }
      $form.prepend('<div class="messages crm-error stripe-message">'
      + '<strong>Payment Error Response:</strong>'
      + '<ul id="errorList">'
      + '<li>Error: ' + response.error.message + '</li>'
      + '</ul>'
      + '</div>');

      $submit.removeAttr('disabled').attr('value', buttonText);

    }
    else {
      var token = response['id'];
      // Update form with the token & submit.
      $form.find("input#stripe-token").val(token);
      $form.find("input#credit_card_number").removeAttr('name');
      $form.find("input#cvv2").removeAttr('name');
      $submit.prop('disabled', false);
      window.onbeforeunload = null;
      $form.get(0).submit();
    }
  }

  // Prepare the form.
  $(document).ready(function() {
    $.getScript('https://js.stripe.com/v2/', function () {
      Stripe.setPublishableKey($('#stripe-pub-key').val());
    });

    if ($('.webform-client-form').length) {
      isWebform = true;
      $('form.webform-client-form').addClass('stripe-payment-form');
    }
    else {
      if (!($('.stripe-payment-form').length)) {
        $('#crm-container > form').addClass('stripe-payment-form');
      }
    }
    $form   = $('form.stripe-payment-form');
    if (isWebform) {
      $submit = $form.find('.button-primary');
    }
    else {
      $submit = $form.find('input[type="submit"][formnovalidate!="1"]');

      // If CiviDiscount button or field is submitted, flag the form.
      $form.data('cividiscount-dont-handle', '0');
      // This is an ugly hack. Really, the code should positively identify the
      // "real" submit button(s) and only respond to them.  Otherwise, we're
      // chasing down a potentially endless number of exceptions.  The problem
      // is that it's unclear if CiviCRM consistently names its submit buttons.
      $form.find('input[type="submit"][formnovalidate="1"], input[type="submit"].cancel').click( function() {
        $form.data('cividiscount-dont-handle', 1);
      });
      $form.find('input#discountcode').keypress( function(e) {
        if (e.which == 13) {
          $form.data('cividiscount-dont-handle', 1);
        }
      });
      $submit;
    }

    // For CiviCRM Webforms.
    if (isWebform) {
      if (!($('#action').length)) {
        $form.append('<input type="hidden" name="op" id="action" />');
      }
      $(document).keypress(function(event) {
        if (event.which == 13) {
          event.preventDefault();
          $submit.click();
        }
      });
      $(":submit").click(function() {
        $('#action').val(this.value);
      });
      $('#billingcheckbox:input').hide();
      $('label[for="billingcheckbox"]').hide();

      var webformPrevious = $('input.webform-previous').first().val();
    }
    else {
      // This is native civicrm form - check for existing token.
      if ($form.find("input#stripe-token").val()) {
        $('.credit_card_info-group').hide();
        $('#billing-payment-block').append('<input type="button" value="Edit CC details" id="ccButton" />');
        $('#ccButton').click(function() {
          $('.credit_card_info-group').show();
          $('#ccButton').hide();
          $form.find('input#stripe-token').val('');
        });
      }
    }

    $submit.removeAttr('onclick');

    $form.unbind('submit');

    // Intercept form submission.
    $form.submit(function (event) {
      // Don't handle submits generated by the CiviDiscount button.
      if ($form.data('cividiscount-dont-handle') == 1) {
        debugging('debug: pvjwy (Discount is in play)');
        return true;
      }
      if (isWebform) {
        var $processorFields = $('.civicrm-enabled[name$="civicrm_1_contribution_1_contribution_payment_processor_id]"]');

        if ($('#action').attr('value') == webformPrevious) {
          debugging('wmlfp');
          return true;
        }
        if ($('#wf-crm-billing-total').length) {
          if ($('#wf-crm-billing-total').data('data-amount') == '0') {
            debugging('qplfr');
            return true;
          }
        }
        if ($processorFields.length) {
          if ($processorFields.filter(':checked').val() == '0') {
            debugging('evxyh');
            return true;
          }
          if (!($form.find('input[name="stripe_token"]').length)) {
            debugging('irjfg');
            return true;
          }
        }
      }
      // Disable the submit button to prevent repeated clicks, cache button text, restore if Stripe returns error
      buttonText = $submit.attr('value');
      $submit.prop('disabled', true).attr('value', 'Processing');

      // Hide payment if total is 0 and no more participants.
      if ($('#priceset').length) {
        additionalParticipants = cj("#additional_participants").val();
        // The currentTotal is already being calculated in Form/Contribution/Main.tpl.
        if(typeof currentTotal !== 'undefined') {
          if (currentTotal == 0 && !additionalParticipants) {
            // This is also hit when "Going back", but we already have stripe_token.
            debugging('ozlkf');
            // This should not happen on Confirm Contribution, but seems to on 4.6 for some reason.
            //return true;
          }
        }
      }

      // Handle multiple payment options and Stripe not being chosen.
      if ($form.find(".crm-section.payment_processor-section").length > 0) {
        var extMode = $('#ext-mode').val();
        var stripeProcessorId = $('#stripe-id').val();
        // Support for CiviCRM 4.6 and 4.7 multiple payment options
        if (extMode == 1) {
          var chosenProcessorId = $form.find('input[name="payment_processor"]:checked').val();
        }
        else if (extMode == 2) {
          var chosenProcessorId = $form.find('input[name="payment_processor_id"]:checked').val();
        }
        // Bail if we're not using Stripe or are using pay later (option value '0' in payment_processor radio group).
        if ((chosenProcessorId != stripeProcessorId) || (chosenProcessorId == 0)) {
          debugging('debug: kfoej (Not a Stripe transaction, or pay-later)');
          return true;
        }
      }
      else {
          debugging('debug: qlmvy (Stripe is the only payprocessor here)');
      }

      // Handle reuse of existing token
      if ($form.find("input#stripe-token").val()) {
        $form.find("input#credit_card_number").removeAttr('name');
        $form.find("input#cvv2").removeAttr('name');
        debugging('debug: zpqef (Re-using Stripe token)');
        return true;
      }

      // If there's no credit card field, no use in continuing (probably wrong
      // context anyway)
      if (!$form.find('#credit_card_number').length) {
        debugging('debug: gvzod (No credit card field)');
        return true;
      }

      event.preventDefault();
      event.stopPropagation();

      // Handle changes introduced in CiviCRM 4.3.
      if ($form.find('#credit_card_exp_date_M').length > 0) {
        var cc_month = $form.find('#credit_card_exp_date_M').val();
        var cc_year = $form.find('#credit_card_exp_date_Y').val();
      }
      else {
        var cc_month = $form.find('#credit_card_exp_date\\[M\\]').val();
        var cc_year = $form.find('#credit_card_exp_date\\[Y\\]').val();
      }
      Stripe.card.createToken({
        name:        $form.find('#billing_first_name').val() + ' ' + $form.find('#billing_last_name').val(),
        address_zip: $form.find('#billing_postal_code-5').val(),
        number:      $form.find('#credit_card_number').val(),
        cvc:         $form.find('#cvv2').val(),
        exp_month:   cc_month,
        exp_year:    cc_year
      }, stripeResponseHandler);

      debugging('debug: ywkvh (Getting Stripe token)');
      return false;
    });
  });
}(cj, CRM));

function debugging (errorCode) {
// Uncomment the following to debug unexpected returns.
//  console.log(errorCode);
}

